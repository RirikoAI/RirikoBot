import {
  AfterLoad,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserNote } from '#database/entities/user-note.entity';
import { Exclude, Expose } from 'class-transformer';
import { AuthProvidersEnum } from '#auth/auth-providers.enum';
import { Role } from '#database/entities/role.entity';
import { Status } from '#database/entities/status.entity';
import bcrypt from 'bcryptjs';
import { EntityHelper } from '#util/entities/entity-helper';

/**
 * User entity
 * @description User entity for the database
 * @author Earnest Angel (https://angel.net.my)
 */
@Entity()
export class User extends EntityHelper {
  @PrimaryColumn()
  id: string;

  // For "string | null" we need to use String type.
  // More info: https://github.com/typeorm/typeorm/issues/2567
  @Column({ type: String, unique: true, nullable: true })
  @Expose({ groups: ['me', 'admin'] })
  email: string | null;

  @Column({ nullable: true })
  @Exclude({ toPlainOnly: true })
  password?: string;

  @Exclude({ toPlainOnly: true })
  public previousPassword?: string;

  @AfterLoad()
  public loadPreviousPassword(): void {
    this.previousPassword = this.password;
  }

  @BeforeInsert()
  @BeforeUpdate()
  async setPassword() {
    if (this.previousPassword !== this.password && this.password) {
      const salt = await bcrypt.genSalt();
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  @Column({ default: AuthProvidersEnum.email })
  @Expose({ groups: ['me', 'admin'] })
  provider: string;

  @Index()
  @Column({ type: String, nullable: true })
  @Expose({ groups: ['me', 'admin'] })
  socialId?: string | null;

  @Index()
  @Column({ type: String, nullable: true })
  firstName?: string | null;

  @Index()
  @Column({ type: String, nullable: true })
  lastName?: string | null;

  @ManyToOne(() => Role, {
    eager: true,
  })
  role?: Role | null;

  @ManyToOne(() => Status, {
    eager: true,
  })
  status?: Status;

  @Column({ type: String, nullable: true })
  @Index()
  @Exclude({ toPlainOnly: true })
  hash?: string | null;

  @Column()
  username: string;

  @Column()
  displayName: string;

  @Column({
    default: null,
  })
  backgroundImageURL: string;

  @Column({
    default: 0,
  })
  karma: number;

  @Column({
    default: 0,
  })
  coins: number;

  @Column({
    default: false,
  })
  pointsSuspended: boolean;

  @Column({
    default: false,
  })
  commandsSuspended: boolean;

  @Column({
    default: false,
  })
  doNotNotifyOnLevelUp: boolean;

  @Column({
    default: 0,
  })
  warns: number;

  @OneToMany(() => UserNote, (userNote) => userNote.user)
  notes: UserNote[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
