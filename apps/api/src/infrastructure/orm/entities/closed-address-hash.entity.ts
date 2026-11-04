import { Entity, PrimaryColumn } from 'typeorm';

// All we keep of an under-13 account: a keyed hash that refuses the address and cannot be read back into it.
@Entity('closed_address_hashes')
export class ClosedAddressHashEntity {
  @PrimaryColumn('text', { name: 'address_hash' })
  addressHash!: string;
}
