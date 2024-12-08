import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Configuration {
  @PrimaryColumn()
  applicationId: string;

  @Column({
    nullable: true,
  })
  twitchClientId: string;

  @Column({
    nullable: true,
  })
  twitchClientSecret: string;

  @Column({
    nullable: true,
  })
  stableDiffusionType: string;

  @Column({
    nullable: true,
  })
  stableDiffusionApiToken: string;
}
