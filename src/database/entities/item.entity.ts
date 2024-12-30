import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ItemCategory } from '#database/entities/item-category.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * Item Entity
 * @description The item entity represents an item in the database.
 * @property {string} id - The item ID.
 * @property {string} name - The item name.
 * @property {number} price - The item price.
 * @property {string} description - The item description.
 * @property {number} rarity - The item rarity.
 * @property {boolean} hidden - The item hidden status.
 * @property {number} purchaseLimit - The item purchase limit.
 * @property {boolean} purchasable - The item purchasable status.
 * @property {boolean} sellable - The item sellable status.
 * @property {boolean} findable - The item findable status.
 * @property {string} imageUrl - The item image URL.
 * @property {Date} createdAt - The item created date.
 * @property {Date} updatedAt - The item updated date.
 * @property {ItemCategory} category - The item category.
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Item extends EntityHelper {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  price: number;

  @Column()
  description: string;

  @Column()
  rarity: number;

  @Column({
    default: false,
  })
  hidden: boolean;

  @Column({
    default: 0,
  })
  purchaseLimit: number;

  @Column({
    default: false,
  })
  purchasable: boolean;

  @Column({
    default: false,
  })
  sellable: boolean;

  @Column({
    default: false,
  })
  findable: boolean;

  @Column()
  imageUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ItemCategory, (itemCategory) => itemCategory.items, {
    lazy: true,
  })
  category: ItemCategory;
}
