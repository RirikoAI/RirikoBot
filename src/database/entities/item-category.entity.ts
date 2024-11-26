import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Item } from '#database/entities/item.entity';

@Entity()
export class ItemCategory {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  name: string;

  @OneToMany(() => Item, (item) => item.category)
  items: Item[];
}
