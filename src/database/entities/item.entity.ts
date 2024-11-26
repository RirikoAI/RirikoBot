import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ItemCategory } from '#database/entities/item-category.entity';

@Entity()
export class Item {
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
