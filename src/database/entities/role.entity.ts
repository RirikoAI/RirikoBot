import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Role {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;
}
