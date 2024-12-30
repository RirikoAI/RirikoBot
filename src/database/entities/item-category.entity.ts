import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Item } from '#database/entities/item.entity';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * ItemCategory Entity
 * Represents the item category entity in the database.
 * @extends ItemCategory
 * @property {string} id - The unique identifier of the item category.
 * @property {string} name - The name of the item category.
 * @property {Item[]} items - The items that belong to the item category.
 * @see Item
 *
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class ItemCategory extends EntityHelper {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  name: string;

  @OneToMany(() => Item, (item) => item.category)
  items: Item[];
}
