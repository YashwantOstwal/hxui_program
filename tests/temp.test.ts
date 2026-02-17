import anchor from "@coral-xyz/anchor";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  unpackMint,
  unpackAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountState,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
  type AccountInfo,
} from "@solana/web3.js";
import assert, { Assert } from "assert";
import bs58 from "bs58";
import {
  FailedTransactionMetadata,
  LiteSVM,
  TransactionMetadata,
} from "litesvm";
import IDL from "../target/idl/hxui.json" with { type: "json" };
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system.js";

import { Program } from "@coral-xyz/anchor";
import { Hxui } from "../target/types/hxui.js";
describe("", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.hxui as Program<Hxui>;

  const { connection } = provider;
  const { payer } = provider.wallet;

  const airdrop = async (
    ...args: Parameters<typeof connection.requestAirdrop>
  ) => {
    const signature = await connection.requestAirdrop(...args);
    await connection.confirmTransaction(signature, "confirmed");
  };
  const [hxuiVaultAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_vault")],
    program.programId,
  );
  const admin = new Keypair();
  before(async () => {
    await airdrop(admin.publicKey, LAMPORTS_PER_SOL);
  });
  it("test", async () => {
    await program.methods
      .initialiseDapp(new anchor.BN(0.01 * LAMPORTS_PER_SOL), new anchor.BN(2))
      .accounts({
        admin: admin.publicKey,
        liteAuthority: PublicKey.unique(),
      })
      .signers([admin])
      .rpc();
  });
});
