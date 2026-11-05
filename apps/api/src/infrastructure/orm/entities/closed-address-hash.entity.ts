import { Entity, PrimaryColumn } from 'typeorm';

@Entity('closed_address_hashes')
export class ClosedAddressHashEntity {
  @PrimaryColumn('text', { name: 'address_hash' })
  addressHash!: string;
}
