import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class Giveaway {
  @PrimaryColumn()
  id: string;

  @Column()
  name: String;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column()
  winners: number;

  @Column()
  status: string;
}
