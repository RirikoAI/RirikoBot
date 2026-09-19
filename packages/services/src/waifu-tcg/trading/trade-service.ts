import type {
  CardTradeRepository,
  WaifuCardRepository,
  EconomyRepository,
  DatabaseClient,
  CardTrade,
  UserCard,
  WaifuCard,
} from '@ririko/database';
import { withTransaction } from '@ririko/database';

export interface CreateTradeProposalParams {
  senderUserId: string;
  receiverUserId: string;
  offeredCardIds?: string[];
  requestedCardIds?: string[];
  offeredCredits?: number;
  requestedCredits?: number;
}

export interface TradeEnrichedCard {
  userCard: UserCard;
  cardInfo: WaifuCard | null;
}

export interface EnrichedTradeDetails {
  trade: CardTrade;
  offeredCards: TradeEnrichedCard[];
  requestedCards: TradeEnrichedCard[];
}

export class TradeService {
  constructor(
    private readonly cardTradeRepo: CardTradeRepository,
    private readonly waifuCardRepo: WaifuCardRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly dbClient: DatabaseClient,
  ) {}

  async createProposal(params: CreateTradeProposalParams): Promise<CardTrade> {
    const {
      senderUserId,
      receiverUserId,
      offeredCardIds = [],
      requestedCardIds = [],
      offeredCredits = 0,
      requestedCredits = 0,
    } = params;

    if (senderUserId === receiverUserId) {
      throw new Error('You cannot trade with yourself.');
    }

    if (offeredCredits < 0 || requestedCredits < 0) {
      throw new Error('Offered and requested credits must be non-negative.');
    }

    if (
      offeredCardIds.length === 0 &&
      requestedCardIds.length === 0 &&
      offeredCredits === 0 &&
      requestedCredits === 0
    ) {
      throw new Error('A trade proposal must offer or request at least one card or credit amount.');
    }

    // Check existing pending trade between the two users
    const existing = await this.cardTradeRepo.findActiveTradeBetween(senderUserId, receiverUserId);
    if (existing) {
      throw new Error(
        `There is already an active trade (${existing.id}) between these users. Complete or cancel it first.`,
      );
    }

    // Validate sender cards
    for (const cardId of offeredCardIds) {
      const card = await this.waifuCardRepo.findUserCardById(cardId);
      if (!card) {
        throw new Error(`Offered card ${cardId} does not exist.`);
      }
      if (card.userId !== senderUserId) {
        throw new Error(`You do not own offered card ${cardId}.`);
      }
      if (card.state !== 'IDLE') {
        throw new Error(`Offered card ${cardId} is not available for trade (current state: ${card.state}).`);
      }
      if (card.isFavorite) {
        throw new Error(`Offered card ${cardId} is marked as favorite. Unfavorite it first.`);
      }
    }

    // Validate receiver cards
    for (const cardId of requestedCardIds) {
      const card = await this.waifuCardRepo.findUserCardById(cardId);
      if (!card) {
        throw new Error(`Requested card ${cardId} does not exist.`);
      }
      if (card.userId !== receiverUserId) {
        throw new Error(`The other user does not own requested card ${cardId}.`);
      }
      if (card.state !== 'IDLE') {
        throw new Error(`Requested card ${cardId} is not available for trade (current state: ${card.state}).`);
      }
      if (card.isFavorite) {
        throw new Error(`Requested card ${cardId} is marked as favorite by its owner.`);
      }
    }

    // Validate sender credits
    if (offeredCredits > 0) {
      const senderBalance = await this.economyRepo.findById(senderUserId);
      const availableWallet = Number(senderBalance?.walletBalance ?? 0);
      if (availableWallet < offeredCredits) {
        throw new Error(`Insufficient credits. You have ${availableWallet} credits, but offered ${offeredCredits}.`);
      }
    }

    // Validate receiver credits
    if (requestedCredits > 0) {
      const receiverBalance = await this.economyRepo.findById(receiverUserId);
      const availableWallet = Number(receiverBalance?.walletBalance ?? 0);
      if (availableWallet < requestedCredits) {
        throw new Error(`The other user has insufficient credits (${availableWallet}) for the requested ${requestedCredits}.`);
      }
    }

    // Execute atomic proposal creation with state locking
    return withTransaction(this.dbClient, async (tx) => {
      // Lock offered cards
      for (const cardId of offeredCardIds) {
        await this.waifuCardRepo.updateUserCardState(cardId, 'IN_TRADE', tx);
      }

      // Lock requested cards
      for (const cardId of requestedCardIds) {
        await this.waifuCardRepo.updateUserCardState(cardId, 'IN_TRADE', tx);
      }

      // Insert trade record
      return this.cardTradeRepo.create(
        {
          senderUserId,
          receiverUserId,
          offeredCardIds,
          requestedCardIds,
          offeredCredits,
          requestedCredits,
          status: 'PENDING',
        },
        tx,
      );
    });
  }

  async acceptTrade(tradeId: string, userId: string): Promise<CardTrade> {
    const trade = await this.cardTradeRepo.findById(tradeId);
    if (!trade) {
      throw new Error(`Trade ${tradeId} not found.`);
    }

    if (trade.status !== 'PENDING') {
      throw new Error(`Trade ${tradeId} is not pending (status: ${trade.status}).`);
    }

    if (trade.receiverUserId !== userId) {
      throw new Error('Only the trade recipient can accept this proposal.');
    }

    // Execute atomic balance & card ownership swap
    return withTransaction(this.dbClient, async (tx) => {
      // Transfer credits if offered by sender
      if (trade.offeredCredits > 0) {
        await this.economyRepo.transferBalance(
          {
            fromUserId: trade.senderUserId,
            toUserId: trade.receiverUserId,
            amount: trade.offeredCredits,
            source: 'TCG_TRADE',
            metadata: { tradeId: trade.id, direction: 'SENDER_TO_RECEIVER' },
          },
          tx,
        );
      }

      // Transfer credits if requested from receiver
      if (trade.requestedCredits > 0) {
        await this.economyRepo.transferBalance(
          {
            fromUserId: trade.receiverUserId,
            toUserId: trade.senderUserId,
            amount: trade.requestedCredits,
            source: 'TCG_TRADE',
            metadata: { tradeId: trade.id, direction: 'RECEIVER_TO_SENDER' },
          },
          tx,
        );
      }

      // Transfer offered cards to receiver
      for (const cardId of trade.offeredCardIds) {
        await this.waifuCardRepo.updateUserCardOwner(cardId, trade.receiverUserId, 'IDLE', tx);
      }

      // Transfer requested cards to sender
      for (const cardId of trade.requestedCardIds) {
        await this.waifuCardRepo.updateUserCardOwner(cardId, trade.senderUserId, 'IDLE', tx);
      }

      // Update trade status to ACCEPTED
      return this.cardTradeRepo.updateStatus(trade.id, 'ACCEPTED', tx);
    });
  }

  async rejectTrade(tradeId: string, userId: string): Promise<CardTrade> {
    const trade = await this.cardTradeRepo.findById(tradeId);
    if (!trade) {
      throw new Error(`Trade ${tradeId} not found.`);
    }

    if (trade.status !== 'PENDING') {
      throw new Error(`Trade ${tradeId} is not pending (status: ${trade.status}).`);
    }

    if (trade.receiverUserId !== userId && trade.senderUserId !== userId) {
      throw new Error('You are not a participant in this trade.');
    }

    return withTransaction(this.dbClient, async (tx) => {
      // Unlock all cards back to IDLE
      for (const cardId of trade.offeredCardIds) {
        await this.waifuCardRepo.updateUserCardState(cardId, 'IDLE', tx);
      }
      for (const cardId of trade.requestedCardIds) {
        await this.waifuCardRepo.updateUserCardState(cardId, 'IDLE', tx);
      }

      return this.cardTradeRepo.updateStatus(trade.id, 'REJECTED', tx);
    });
  }

  async cancelTrade(tradeId: string, userId: string): Promise<CardTrade> {
    const trade = await this.cardTradeRepo.findById(tradeId);
    if (!trade) {
      throw new Error(`Trade ${tradeId} not found.`);
    }

    if (trade.status !== 'PENDING') {
      throw new Error(`Trade ${tradeId} is not pending (status: ${trade.status}).`);
    }

    if (trade.senderUserId !== userId) {
      throw new Error('Only the sender can cancel this trade proposal.');
    }

    return withTransaction(this.dbClient, async (tx) => {
      // Unlock all cards back to IDLE
      for (const cardId of trade.offeredCardIds) {
        await this.waifuCardRepo.updateUserCardState(cardId, 'IDLE', tx);
      }
      for (const cardId of trade.requestedCardIds) {
        await this.waifuCardRepo.updateUserCardState(cardId, 'IDLE', tx);
      }

      return this.cardTradeRepo.updateStatus(trade.id, 'CANCELLED', tx);
    });
  }

  async getTradeDetails(tradeId: string): Promise<EnrichedTradeDetails | null> {
    const trade = await this.cardTradeRepo.findById(tradeId);
    if (!trade) return null;

    const offeredCards: TradeEnrichedCard[] = [];
    for (const cardId of trade.offeredCardIds) {
      const userCard = await this.waifuCardRepo.findUserCardById(cardId);
      if (userCard) {
        const cardInfo = await this.waifuCardRepo.findById(userCard.cardId);
        offeredCards.push({ userCard, cardInfo });
      }
    }

    const requestedCards: TradeEnrichedCard[] = [];
    for (const cardId of trade.requestedCardIds) {
      const userCard = await this.waifuCardRepo.findUserCardById(cardId);
      if (userCard) {
        const cardInfo = await this.waifuCardRepo.findById(userCard.cardId);
        requestedCards.push({ userCard, cardInfo });
      }
    }

    return { trade, offeredCards, requestedCards };
  }

  async listPendingTrades(userId: string): Promise<CardTrade[]> {
    return this.cardTradeRepo.listPendingTradesForUser(userId);
  }
}
