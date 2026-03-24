// IMPORTS & SETUP
import anchor from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  unpackMint,
  unpackAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
  type AccountInfo,
  SystemProgram,
  type AccountMeta,
} from "@solana/web3.js";
import assert from "assert";
import {
  FailedTransactionMetadata,
  LiteSVM,
  TransactionMetadata,
} from "litesvm";
import IDL from "../target/idl/hxui.json" with { type: "json" };

// CONSTANTS & GLOBALS
const svm = new LiteSVM();
const programId = new PublicKey(IDL.address);
const coder = new anchor.BorshCoder(IDL as anchor.Idl);

// Program paths and initializations
const programPath = new URL("../target/deploy/hxui.so", import.meta.url)
  .pathname;
svm.addProgramFromFile(programId, programPath);

// Keypairs
const payer = new Keypair();
svm.airdrop(payer.publicKey, BigInt(LAMPORTS_PER_SOL));

const admin = new Keypair();
const adminPubkey = admin.publicKey;
svm.airdrop(adminPubkey, BigInt(LAMPORTS_PER_SOL));

const liteAuthority = new Keypair();
const users: Keypair[] = [];

// Protocol Settings
const price_per_token = new anchor.BN(0.001 * LAMPORTS_PER_SOL);
const tokens_per_vote = new anchor.BN(2);
const free_tokens_per_mint = new anchor.BN(1);
const free_mints_per_epoch = new anchor.BN(100);
const free_mint_cool_down = new anchor.BN(43200);
const min_votes_to_win = new anchor.BN(10);

const hxui_metadata = {
  name: "100xui",
  symbol: "HXUI",
  uri: "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/DeveloperPortal/metadata.json",
} as const;

// Types & Test Tracking variables
interface HxuiCandidate {
  name: string;
  description: string;
  address: PublicKey;
  bump: number;
}
const newCandidates: {
  claimableWinner: HxuiCandidate[];
  winner: HxuiCandidate[];
  withdrawn: HxuiCandidate[];
  active: HxuiCandidate[];
} = {
  claimableWinner: [],
  winner: [],
  withdrawn: [],
  active: [],
};
const activeCandidates: HxuiCandidate[] = [];

// PDA & SEED HELPERS
const PDAs: Record<string, { address: PublicKey; bump: number }> = {};
const SEEDS: Record<string, string> = {
  hxuiVault: "hxui_vault",
  hxuiMint: "hxui_mint",
  hxuiConfig: "hxui_config",
  hxuiLiteMint: "hxui_lite_mint",
  hxuiDropTime: "hxui_drop_time",
  hxuiFreeTokensCounter: "hxui_free_mint_counter",
} as const;

export function getPda(of: keyof typeof SEEDS) {
  if (!PDAs[of]) {
    const [address, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(of)],
      programId,
    );
    PDAs[of] = { address, bump };
  }
  return PDAs[of];
}

function getCandidatePda(name: string) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_candidate"), Buffer.from(name)],
    programId,
  );
  return { address, bump } as const;
}

function getVoteReceiptPda(candidateName: string, owner: PublicKey) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote_receipt"), Buffer.from(candidateName), owner.toBuffer()],
    programId,
  );
  return { address, bump };
}

function getFreeMintTrackerPda(owner: PublicKey) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("free_mint_tracker"), owner.toBuffer()],
    programId,
  );
  return { address, bump };
}

function getHxuiTokenAddress(owner: PublicKey) {
  return getAssociatedTokenAddressSync(
    getPda(SEEDS.hxuiMint).address,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getHxuiLiteTokenAddress(owner: PublicKey) {
  return getAssociatedTokenAddressSync(
    getPda(SEEDS.hxuiLiteMint).address,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
}

// ACCOUNT FETCHING HELPERS
function getConfigAccountData() {
  const accountInfo = svm.getAccount(getPda(SEEDS.hxuiConfig).address);
  return coder.accounts.decode("HxuiConfig", Buffer.from(accountInfo.data));
}

function getDropTimeAccountData() {
  const accountInfo = svm.getAccount(getPda(SEEDS.hxuiDropTime).address);
  return coder.accounts.decode("HxuiDropTime", Buffer.from(accountInfo.data));
}

function getCandidateAccountData(name: string) {
  const address = getCandidatePda(name).address;
  const accountInfo = svm.getAccount(address);
  return coder.accounts.decode("HxuiCandidate", Buffer.from(accountInfo.data));
}

function getFreeTokensCounterAccountData() {
  const address = getPda(SEEDS.hxuiFreeTokensCounter).address;
  const accountInfo = svm.getAccount(address);
  return coder.accounts.decode(
    "HxuiFreeMintCounter",
    Buffer.from(accountInfo.data),
  );
}

function getFreeMintTrackerAccountData(owner: PublicKey) {
  const address = getFreeMintTrackerPda(owner).address;
  const accountInfo = svm.getAccount(address);
  return coder.accounts.decode(
    "FreeMintTracker",
    Buffer.from(accountInfo.data),
  );
}

function getVoteReceipt(candidateName: string, owner: PublicKey) {
  const address = getVoteReceiptPda(candidateName, owner).address;
  const voteReceiptAccountInfo = svm.getAccount(address);
  const voteReceiptData = coder.accounts.decode(
    "VoteReceipt",
    Buffer.from(voteReceiptAccountInfo.data),
  );
  return [voteReceiptData, voteReceiptAccountInfo] as const;
}

function getHxuiMintData() {
  const address = getPda(SEEDS.hxuiMint).address;
  const accountInfo = svm.getAccount(address);
  return unpackMint(
    address,
    accountInfo as AccountInfo<Buffer>,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getHxuiLiteMintData() {
  const address = getPda(SEEDS.hxuiLiteMint).address;
  const accountInfo = svm.getAccount(address);
  return unpackMint(
    address,
    accountInfo as AccountInfo<Buffer>,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getHxuiTokenAccountData(owner: PublicKey) {
  const address = getHxuiTokenAddress(owner);
  const accountInfo = svm.getAccount(address);
  return unpackAccount(
    address,
    accountInfo as AccountInfo<Buffer>,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getHxuiLiteTokenAccountData(owner: PublicKey) {
  const address = getHxuiLiteTokenAddress(owner);
  const accountInfo = svm.getAccount(address);
  return unpackAccount(
    address,
    accountInfo as AccountInfo<Buffer>,
    TOKEN_2022_PROGRAM_ID,
  );
}

// TRANSACTION & ASSERTION HELPERS
function sendTransaction(
  ixs: TransactionInstruction[],
  signers: Keypair[] = [],
  options: { logIfFailed: boolean } = { logIfFailed: false },
) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = svm.latestBlockhash();
  tx.sign(payer, ...signers);
  const metadata = svm.sendTransaction(tx);

  if (options.logIfFailed && metadata instanceof FailedTransactionMetadata) {
    console.log(metadata.meta().logs());
  }
  svm.expireBlockhash();
  return metadata;
}

function assertTxFailedWithErrorCode(
  failed: FailedTransactionMetadata | TransactionMetadata,
  errorCode: string,
  printLogs: boolean = false,
) {
  if (failed instanceof TransactionMetadata) {
    assert(false, "Transaction did not fail as expected");
  }
  const logs = failed.meta().logs();
  if (printLogs) console.log(logs);
  for (const log of logs) {
    if (log.search("Error Code: " + errorCode) != -1) {
      assert(true);
      return;
    }
  }
  assert(false, `Transaction failed but not with this ${errorCode} code.`);
}

function checkNonActiveCandidateWith(
  nonActiveCandidateName: string,
  expectedState: {
    while: "before" | "after" | "during";
    hasZeroReceipts?: boolean;
  },
) {
  const candidateAccountData = getCandidateAccountData(nonActiveCandidateName);
  assert(!candidateAccountData.status.Active, "checkNonActive-1");

  if (typeof expectedState.hasZeroReceipts == "boolean") {
    if (expectedState.hasZeroReceipts) {
      assert.equal(
        candidateAccountData.receipt_count.isZero(),
        true,
        "checkNonActive-2",
      );
    } else {
      assert.equal(
        candidateAccountData.receipt_count.isZero(),
        false,
        "checkNonActive-3",
      );
    }
  }

  const now = svm.getClock();
  switch (expectedState.while) {
    case "before":
      assert(
        candidateAccountData.claim_deadline.eq(new anchor.BN(0)),
        "checkNonActive-4",
      );
      break;
    case "during":
      assert(
        candidateAccountData.claim_deadline.cmp(
          new anchor.BN(now.unixTimestamp),
        ) != -1,
        "checkNonActive-5",
      );
      break;
    case "after":
      assert.equal(
        candidateAccountData.claim_deadline.isZero(),
        false,
        "checkNonActive-6",
      );
      assert(
        candidateAccountData.claim_deadline.cmp(
          new anchor.BN(now.unixTimestamp),
        ) == -1,
        "checkNonActive-7",
      );
      break;
  }
}

// INSTRUCTION (IXN) HELPERS
function getInitDuiInstruction() {
  const data = coder.instruction.encode("init_dui", {
    price_per_token,
    tokens_per_vote,
    free_tokens_per_mint,
    free_mints_per_epoch,
    free_mint_cool_down,
    min_votes_to_win,
  });
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: true },
      { pubkey: liteAuthority.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiLiteMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiFreeTokensCounter).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiDropTime).address,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getBuyTokensInstruction(
  accounts: { owner: PublicKey },
  args: { amount: anchor.BN },
) {
  const data = coder.instruction.encode("buy_tokens", args);
  const tokenAta = getHxuiTokenAddress(accounts.owner);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      { pubkey: tokenAta, isSigner: false, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getCancelDeregisterFromFreeMintInstruction(accounts: {
  owner: PublicKey;
}) {
  const data = coder.instruction.encode("cancel_deregister_from_free_mint", {});
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: false },
      {
        pubkey: getFreeMintTrackerPda(accounts.owner).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getClaimBackTokensInstruction(
  accounts: { owner: PublicKey },
  args: { _name: string },
) {
  const data = coder.instruction.encode("claim_back_tokens", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: false },
      {
        pubkey: getHxuiTokenAddress(accounts.owner),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getCandidatePda(args._name).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getVoteReceiptPda(args._name, accounts.owner).address,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
}

function getClaimRegistrationDepositInstruction(accounts: {
  owner: PublicKey;
}) {
  const data = coder.instruction.encode("claim_registration_deposit", {});
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      {
        pubkey: getFreeMintTrackerPda(accounts.owner).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getCloseCandidateInstruction(args: { _name: string }) {
  const data = coder.instruction.encode("close_candidate", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      {
        pubkey: getCandidatePda(args._name).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getCloseVoteReceiptInstruction(
  accounts: { voteReceipt: PublicKey },
  args: { _name: string },
) {
  const data = coder.instruction.encode("close_vote_receipt", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getCandidatePda(args._name).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: accounts.voteReceipt, isSigner: false, isWritable: true },
    ],
    data,
  });
}

function getCreateCandidateInstruction(
  accounts: { admin: PublicKey },
  args: { name: string; description: string; enable_claim_back_offer: boolean },
) {
  const data = coder.instruction.encode("create_candidate", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getCandidatePda(args.name).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiDropTime).address,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getDeregisterFromFreeMintInstruction(accounts: { owner: PublicKey }) {
  const data = coder.instruction.encode("deregister_from_free_mint", {});
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: false },
      {
        pubkey: getFreeMintTrackerPda(accounts.owner).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getDrawWinnerInstruction(candidatesMeta: anchor.web3.AccountMeta[]) {
  const data = coder.instruction.encode("draw_winner", {});
  return new TransactionInstruction({
    programId,
    keys: [
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getPda(SEEDS.hxuiDropTime).address,
        isSigner: false,
        isWritable: true,
      },
      ...candidatesMeta,
    ],
    data,
  });
}

function getEnableClaimBackOfferInstruction(args: { _name: string }) {
  const data = coder.instruction.encode("enable_claim_back_offer", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getCandidatePda(args._name).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getGetAdminAccessForTestingInstruction(accounts: {
  newAdmin: Keypair;
}) {
  const data = coder.instruction.encode("get_admin_access_for_testing", {});
  return new TransactionInstruction({
    programId,
    keys: [
      {
        pubkey: accounts.newAdmin.publicKey,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getMintFreeTokensInstruction(accounts: { owner: PublicKey }) {
  const data = coder.instruction.encode("mint_free_tokens", {});
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: false, isWritable: false },
      { pubkey: liteAuthority.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getHxuiLiteTokenAddress(accounts.owner),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiLiteMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getFreeMintTrackerPda(accounts.owner).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiFreeTokensCounter).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getOpenClaimBackWindowInstruction(args: {
  _name: string;
  until: anchor.BN;
}) {
  const data = coder.instruction.encode("open_claim_back_window", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getCandidatePda(args._name).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getRegisterForFreeTokensInstruction(accounts: { owner: PublicKey }) {
  const data = coder.instruction.encode("register_for_free_tokens", {});
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      {
        pubkey: getFreeMintTrackerPda(accounts.owner).address,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getSetDropTimeInstruction(args: { new_drop_time: anchor.BN }) {
  const data = coder.instruction.encode("set_drop_time", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getPda(SEEDS.hxuiDropTime).address,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getUpdateConfigInstruction(
  accounts: { new_admin?: Keypair } = {},
  args: { price_per_token?: anchor.BN; tokens_per_vote?: anchor.BN } = {},
) {
  const { new_admin: { publicKey: new_admin_pubkey = null } = {} } = accounts;
  const { price_per_token = null, tokens_per_vote = null } = args;

  const data = coder.instruction.encode("update_config", {
    price_per_token,
    tokens_per_vote,
  });
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: true,
      },
      new_admin_pubkey
        ? { pubkey: new_admin_pubkey, isSigner: true, isWritable: false }
        : { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getVoteWithHxuiInstruction(
  accounts: { owner: PublicKey },
  args: { name: string; votes: anchor.BN },
) {
  const data = coder.instruction.encode("vote_with_hxui", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: false },
      {
        pubkey: getHxuiTokenAddress(accounts.owner),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getCandidatePda(args.name).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getVoteReceiptPda(args.name, accounts.owner).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getVoteWithHxuiLiteInstruction(
  accounts: { owner: PublicKey },
  args: { _name: string; votes: anchor.BN },
) {
  const data = coder.instruction.encode("vote_with_hxui_lite", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: false },
      {
        pubkey: getHxuiLiteTokenAddress(accounts.owner),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiLiteMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getCandidatePda(args._name).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getWithdrawCandidateInstruction(args: { _name: string }) {
  const data = coder.instruction.encode("withdraw_candidate", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      {
        pubkey: getCandidatePda(args._name).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiDropTime).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getWithdrawVaultFundsInstruction(
  args: { amount: null | undefined | anchor.BN } = { amount: null },
) {
  const data = coder.instruction.encode("withdraw_vault_funds", args);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiMint).address,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// TESTS SUITES

describe("1) init_dui instruction testing", () => {
  it("1.1) Should successfully initialize the global config account and vault with rent", () => {
    const ix = getInitDuiInstruction();
    const failed = sendTransaction([ix], [admin, liteAuthority], {
      logIfFailed: true,
    });

    if (failed instanceof FailedTransactionMetadata) {
      console.log("failed");
    }

    const configAccountData = getConfigAccountData();

    assert(configAccountData.admin.equals(adminPubkey), "1");
    assert(configAccountData.tokens_per_vote.eq(tokens_per_vote), "2");
    assert(configAccountData.price_per_token.eq(price_per_token), "3");
    assert(
      configAccountData.free_tokens_per_mint.eq(free_tokens_per_mint),
      "4",
    );
    assert(
      configAccountData.free_mints_per_epoch.eq(free_mints_per_epoch),
      "5",
    );
    assert(configAccountData.free_mint_cool_down.eq(free_mint_cool_down), "6");
    assert(configAccountData.min_votes_to_win.eq(min_votes_to_win), "7");
    assert.equal(configAccountData.bump, getPda(SEEDS.hxuiConfig).bump, "8");

    const rent = svm.minimumBalanceForRentExemption(BigInt(0));
    const vaultAddress = getPda(SEEDS.hxuiVault).address;
    const vaultBalance = svm.getBalance(vaultAddress);
    assert.equal(vaultBalance, rent, "9");
  });

  it("1.2) Should fail if initialization is called more than once", () => {
    const ix = getInitDuiInstruction();
    const failed = sendTransaction([ix], [admin, liteAuthority]);
    if (failed instanceof FailedTransactionMetadata) {
      assert(true, "1");
    } else {
      assert(false, "2");
    }
  });

  it("1.3) Should correctly configure the HXUI and HXUI Lite mint accounts", () => {
    const hxuiMintAddress = getPda(SEEDS.hxuiMint).address;
    const hxuiMintAccountInfo = svm.getAccount(hxuiMintAddress);
    assert.notEqual(hxuiMintAccountInfo, null, "1");
    const hxuiMintData = getHxuiMintData();

    assert(hxuiMintAccountInfo!.owner.equals(TOKEN_2022_PROGRAM_ID), "2");
    assert.equal(hxuiMintData.decimals, 0, "3");
    assert(hxuiMintData.mintAuthority!.equals(hxuiMintAddress), "4");
    assert(hxuiMintData.freezeAuthority === null, "5");

    const hxuiLiteMintAddress = getPda(SEEDS.hxuiLiteMint).address;
    const hxuiLiteMintAccountInfo = svm.getAccount(hxuiLiteMintAddress);
    const hxuiLiteMintData = getHxuiLiteMintData();
    assert.notEqual(hxuiLiteMintAccountInfo, null, "6");

    assert(hxuiLiteMintAccountInfo!.owner.equals(TOKEN_2022_PROGRAM_ID), "7");
    assert.equal(hxuiLiteMintData.decimals, 0, "8");
    assert(
      hxuiLiteMintData.mintAuthority!.equals(liteAuthority.publicKey),
      "9",
    );
    assert(hxuiLiteMintData.freezeAuthority === null, "10");
  });

  it("1.4) Should successfully create the initial HxuiDropTime poll account", () => {
    const dropTimeAccountData = getDropTimeAccountData();
    assert(dropTimeAccountData !== null, "1");
    assert(dropTimeAccountData.drop_timestamp.isZero(), "2");
    assert.equal(dropTimeAccountData.is_winner_drawn, false, "3");
    assert.equal(dropTimeAccountData.total_candidate_count, 0, "4");
    assert.equal(dropTimeAccountData.active_candidate_ids.length, 0, "5");
    assert.equal(
      dropTimeAccountData.bump,
      getPda(SEEDS.hxuiDropTime).bump,
      "6",
    );
  });
});

describe("2) HxuiDropTime creation testing", () => {
  it("2.1) Should successfully create a new poll with a valid future deadline", () => {
    const now = svm.getClock();
    const new_drop_time = new anchor.BN(now.unixTimestamp + BigInt(86400 * 7)); // 1 week from now.

    const ix = getSetDropTimeInstruction({ new_drop_time });
    sendTransaction([ix], [admin]);

    const dropTimeAccountData = getDropTimeAccountData();
    assert(dropTimeAccountData.drop_timestamp.eq(new_drop_time), "1");
    assert.equal(dropTimeAccountData.is_winner_drawn, false, "2");
    assert.equal(dropTimeAccountData.total_candidate_count, 0, "3");
    assert.equal(dropTimeAccountData.active_candidate_ids.length, 0, "4");
    assert.equal(
      dropTimeAccountData.bump,
      getPda(SEEDS.hxuiDropTime).bump,
      "5",
    );
  });

  it("2.2) Should fail to draw a winner if the poll deadline has not yet passed", () => {
    const ix = getDrawWinnerInstruction([]);
    const failed = sendTransaction([ix]);
    assertTxFailedWithErrorCode(failed, "DrawTimeNotReached");
  });

  it("2.3) Should fail to create a new poll while the current poll is still active", () => {
    const now = svm.getClock().unixTimestamp;
    const new_drop_time = new anchor.BN(now + BigInt(86400 * 8));
    const ix = getSetDropTimeInstruction({ new_drop_time });
    const failed = sendTransaction([ix], [admin]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("DrawTimeNotReached.") != -1, "1");
    } else {
      assert(false, "2");
    }
  });

  it("2.4) Should fail to create a new poll if the previous poll ended but no winner was drawn", () => {
    let clock = svm.getClock();
    clock.unixTimestamp = clock.unixTimestamp + BigInt(7 * 86400 + 1);
    svm.setClock(clock);

    const dropTimeAccountData = getDropTimeAccountData();
    assert(
      clock.unixTimestamp > dropTimeAccountData.drop_timestamp.toNumber(),
      "1",
    );

    const now = clock.unixTimestamp;
    const new_drop_time = new anchor.BN(now + BigInt(86400 * 7));
    const ix = getSetDropTimeInstruction({ new_drop_time });

    const failed = sendTransaction([ix], [admin]);
    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("PendingWinnerDraw.") != -1, "2");
    } else {
      assert(false, "3");
    }
  });

  it("2.5) Should successfully draw a winner for the current poll");
  it(
    "2.6) Should fail to create a new poll if the deadline is set in the past",
  );
  it(
    "2.7) Should successfully create a subsequent poll after the previous winner is drawn",
  );
});

describe("4) Testing 4", () => {
  it("4.1) Should register a user for free mints and track their timestamp without needing a prior token account", () => {
    const adminHxuiLiteTokenAddress = getHxuiLiteTokenAddress(adminPubkey);
    const hxuiLiteTokenAccountInfo = svm.getAccount(adminHxuiLiteTokenAddress);
    assert.equal(hxuiLiteTokenAccountInfo, null, "1");

    const adminBalanceBefore = svm.getBalance(adminPubkey);
    const ix = getRegisterForFreeTokensInstruction({ owner: adminPubkey });

    const now = svm.getClock().unixTimestamp;
    sendTransaction([ix], [admin]);

    const adminBalanceAfter = svm.getBalance(adminPubkey);
    const freeMintTrackerAddress = getFreeMintTrackerPda(adminPubkey).address;
    const freeMintTrackerAccountInfo = svm.getAccount(freeMintTrackerAddress);

    assert.equal(
      freeMintTrackerAccountInfo!.lamports,
      adminBalanceBefore - adminBalanceAfter,
      "2",
    );

    const freeMintTrackerData = getFreeMintTrackerAccountData(adminPubkey);

    assert.equal(freeMintTrackerData.next_mint_timestamp, now, "3");
    assert.equal(freeMintTrackerData.unregistered, false, "4");
    assert.equal(
      freeMintTrackerData.bump,
      getFreeMintTrackerPda(adminPubkey).bump,
      "5",
    );
  });

  it("4.2) Should fail to mint free tokens if the user does not have an Associated Token Account (ATA)", () => {
    const ix = getMintFreeTokensInstruction({ owner: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(
        failed.meta().logs()[2].search("AccountNotInitialized.") != -1,
        "1",
      );
    } else {
      assert(false, "2");
    }
  });

  it("4.3) Should successfully mint a free token once the user's ATA is created and cooldown is set", () => {
    const creationIx = createAssociatedTokenAccountInstruction(
      adminPubkey,
      getHxuiLiteTokenAddress(adminPubkey),
      adminPubkey,
      getPda(SEEDS.hxuiLiteMint).address,
      TOKEN_2022_PROGRAM_ID,
    );
    const mintIx = getMintFreeTokensInstruction({ owner: adminPubkey });

    const freeTokensCounterDataBefore = getFreeTokensCounterAccountData();
    sendTransaction([creationIx, mintIx], [admin, liteAuthority]);
    const freeTokensCounterDataAfter = getFreeTokensCounterAccountData();

    const configAccountData = getConfigAccountData();
    assert(
      freeTokensCounterDataBefore.remaining_free_mints
        .sub(freeTokensCounterDataAfter.remaining_free_mints)
        .eq(new anchor.BN(configAccountData.free_tokens_per_mint)),
      "1",
    );

    const adminHxuiLiteTokenAccountInfo = svm.getAccount(
      getHxuiLiteTokenAddress(adminPubkey),
    );
    assert.notEqual(adminHxuiLiteTokenAccountInfo, null, "2");
    assert(
      adminHxuiLiteTokenAccountInfo!.owner.equals(TOKEN_2022_PROGRAM_ID),
      "3",
    );

    const hxuiLiteTokenAccountData = getHxuiLiteTokenAccountData(adminPubkey);
    assert(hxuiLiteTokenAccountData.owner.equals(admin.publicKey), "4");
    assert.equal(
      hxuiLiteTokenAccountData.amount,
      configAccountData.free_tokens_per_mint,
      "5",
    );

    const freeMintTrackerData = getFreeMintTrackerAccountData(adminPubkey);
    const now = svm.getClock().unixTimestamp;

    assert(
      freeMintTrackerData.next_mint_timestamp.eq(
        new anchor.BN(now).add(configAccountData.free_mint_cool_down),
      ),
      "6",
    );
    assert(!freeMintTrackerData.unregistered, "7");
    assert.equal(
      freeMintTrackerData.bump,
      getFreeMintTrackerPda(adminPubkey).bump,
      "8",
    );
  });

  it("4.4) Should fail to mint another free token if the cooldown period is active", () => {
    const ix = getMintFreeTokensInstruction({ owner: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("MintCooldownActive.") != -1, "1");
    } else {
      assert(false, "2");
    }
  });

  it("4.5) Should fail to claim the registration rent deposit before formally unregistering", () => {
    const ix = getClaimRegistrationDepositInstruction({ owner: adminPubkey });
    const failed = sendTransaction([ix], [admin]);
    assertTxFailedWithErrorCode(failed, "MustUnregisterFirst");
  });

  it("4.6) Should successfully unregister the user and mark their account as unregistered", () => {
    const ix = getDeregisterFromFreeMintInstruction({ owner: adminPubkey });
    const failed = sendTransaction([ix], [admin]);
    if (failed instanceof FailedTransactionMetadata) {
      console.log(failed.meta().logs());
    }

    const freeMintTrackerData = getFreeMintTrackerAccountData(adminPubkey);
    const configAccountData = getConfigAccountData();
    const now = svm.getClock().unixTimestamp;
    assert(
      freeMintTrackerData.next_mint_timestamp.eq(
        new anchor.BN(now).add(configAccountData.free_mint_cool_down),
      ),
      "1",
    );
    assert(freeMintTrackerData.unregistered, "2");
  });

  it("4.7) Should fail to mint free tokens if the user has unregistered", () => {
    const ix = getMintFreeTokensInstruction({ owner: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);
    assertTxFailedWithErrorCode(failed, "NotRegisteredForFreeTokens.");
  });

  it("4.8) Should fail to claim registration rent if the post-mint cooldown has not yet expired", async () => {
    const ix = getClaimRegistrationDepositInstruction({ owner: adminPubkey });
    const failed = sendTransaction([ix], [admin]);
    assertTxFailedWithErrorCode(failed, "FeeClaimCooldownActive.");
  });

  it("4.9) Should allow a user to cancel their unregistration status and re-enable minting", async () => {
    const ix = getCancelDeregisterFromFreeMintInstruction({
      owner: adminPubkey,
    });
    sendTransaction([ix], [admin]);

    const freeMintTrackerData = getFreeMintTrackerAccountData(adminPubkey);
    assert(!freeMintTrackerData.unregistered, "1");
  });

  it("4.10) Should successfully mint another free token after the cooldown period expires", () => {
    const now = svm.getClock();
    const configAccountData = getConfigAccountData();
    now.unixTimestamp =
      now.unixTimestamp +
      BigInt(configAccountData.free_mint_cool_down.toNumber());
    svm.setClock(now);

    const ix = getMintFreeTokensInstruction({ owner: adminPubkey });
    const hxuiLiteTokenAccountDataBefore =
      getHxuiLiteTokenAccountData(adminPubkey);
    const freeTokensCounterDataBefore = getFreeTokensCounterAccountData();
    sendTransaction([ix], [liteAuthority]);

    const hxuiLiteTokenAccountDataAfter =
      getHxuiLiteTokenAccountData(adminPubkey);
    const freeTokensCounterDataAfter = getFreeTokensCounterAccountData();

    assert.equal(
      hxuiLiteTokenAccountDataAfter.amount -
        hxuiLiteTokenAccountDataBefore.amount,
      BigInt(configAccountData.free_tokens_per_mint),
      "1",
    );
    assert(
      freeTokensCounterDataBefore.remaining_free_mints
        .sub(freeTokensCounterDataAfter.remaining_free_mints)
        .eq(new anchor.BN(configAccountData.free_tokens_per_mint)),
      "2",
    );

    const freeMintTrackerData = getFreeMintTrackerAccountData(adminPubkey);
    assert(
      freeMintTrackerData.next_mint_timestamp.eq(
        new anchor.BN(now.unixTimestamp).add(
          configAccountData.free_mint_cool_down,
        ),
      ),
      "3",
    );
    assert(!freeMintTrackerData.unregistered, "4");
  });

  it("4.11) Should successfully unregister and immediately refund rent if the cooldown period has already expired", async () => {
    const now = svm.getClock();
    const configAccountData = getConfigAccountData();
    now.unixTimestamp =
      now.unixTimestamp +
      BigInt(configAccountData.free_mint_cool_down.toNumber());
    svm.setClock(now);

    const unregisterIx = getDeregisterFromFreeMintInstruction({
      owner: adminPubkey,
    });
    const claimRegistrationFeesIx = getClaimRegistrationDepositInstruction({
      owner: adminPubkey,
    });

    const freeMintTrackerBalance = svm.getBalance(
      getFreeMintTrackerPda(adminPubkey).address,
    );
    const adminBalanceBefore = svm.getBalance(adminPubkey);
    sendTransaction([unregisterIx, claimRegistrationFeesIx], [admin]);
    const adminBalanceAfter = svm.getBalance(adminPubkey);

    assert.equal(
      adminBalanceAfter - adminBalanceBefore,
      freeMintTrackerBalance,
      "1",
    );
  });

  it("4.12) Should strictly enforce the protocol's global free mint limit (100 tokens per epoch)", async () => {
    const freeTokensCounterData = getFreeTokensCounterAccountData();
    const buffer = Math.floor(Math.random() * 3);
    const configAccountData = getConfigAccountData();

    for (
      let i = 0;
      i <=
      freeTokensCounterData.remaining_free_mints.toNumber() /
        configAccountData.free_tokens_per_mint +
        buffer;
      i++
    ) {
      const user = new Keypair();
      svm.airdrop(user.publicKey, BigInt(0.01 * LAMPORTS_PER_SOL));

      const tokenCreationIx = createAssociatedTokenAccountInstruction(
        user.publicKey,
        getHxuiLiteTokenAddress(user.publicKey),
        user.publicKey,
        getPda(SEEDS.hxuiLiteMint).address,
        TOKEN_2022_PROGRAM_ID,
      );
      const registerIx = getRegisterForFreeTokensInstruction({
        owner: user.publicKey,
      });
      const mintIx = getMintFreeTokensInstruction({ owner: user.publicKey });

      const metadata = sendTransaction(
        [registerIx, tokenCreationIx, mintIx],
        [user, liteAuthority],
      );

      if (metadata instanceof FailedTransactionMetadata) {
        assertTxFailedWithErrorCode(metadata, "OverallFreeMintLimitExceeded");
        assert(
          i >=
            Math.floor(
              freeTokensCounterData.remaining_free_mints.toNumber() /
                configAccountData.free_tokens_per_mint,
            ),
          "1",
        );
      } else {
        assert(
          i <
            Math.floor(
              freeTokensCounterData.remaining_free_mints.toNumber() /
                configAccountData.free_tokens_per_mint,
            ),
          "2",
        );
        const hxuiLiteTokenAccountData = getHxuiLiteTokenAccountData(
          user.publicKey,
        );
        assert.equal(
          hxuiLiteTokenAccountData.amount,
          configAccountData.free_tokens_per_mint,
          "3",
        );
      }
    }
  }).slow(5000);

  it("4.13) Should allow free minting again once a new epoch starts and resets the counter", () => {
    const freeTokensCounterData = getFreeTokensCounterAccountData();
    const configAccountData = getConfigAccountData();

    assert(
      freeTokensCounterData.remaining_free_mints.cmp(
        new anchor.BN(configAccountData.free_tokens_per_mint),
      ) == -1,
      "1",
    );

    const clock = svm.getClock();
    clock.epoch = clock.epoch + BigInt(1);
    svm.setClock(clock);

    const user = new Keypair();
    svm.airdrop(user.publicKey, BigInt(0.01 * LAMPORTS_PER_SOL));

    const tokenCreationIx = createAssociatedTokenAccountInstruction(
      user.publicKey,
      getHxuiLiteTokenAddress(user.publicKey),
      user.publicKey,
      getPda(SEEDS.hxuiLiteMint).address,
      TOKEN_2022_PROGRAM_ID,
    );
    const registerIx = getRegisterForFreeTokensInstruction({
      owner: user.publicKey,
    });
    const mintIx = getMintFreeTokensInstruction({ owner: user.publicKey });

    const metadata = sendTransaction(
      [registerIx, tokenCreationIx, mintIx],
      [user, liteAuthority],
    );

    assert(metadata instanceof TransactionMetadata, "2");
    const freeTokensCounterDataAfter = getFreeTokensCounterAccountData();

    assert(
      freeTokensCounterDataAfter.remaining_free_mints.eq(
        new anchor.BN(configAccountData.free_mints_per_epoch).sub(
          new anchor.BN(configAccountData.free_tokens_per_mint),
        ),
      ),
      "3",
    );

    assert(
      freeTokensCounterDataAfter.current_epoch
        .sub(freeTokensCounterData.current_epoch)
        .eq(new anchor.BN(1)),
      "4",
    );
  });
});

// users.length = 3
describe("5) Buying HXUI tokens for users[0]", async () => {
  before(async () => {
    for (let i = 0; i < 3; i++) {
      const user = new Keypair();
      svm.airdrop(user.publicKey, BigInt(LAMPORTS_PER_SOL));
      users.push(user);
    }
  });

  const tokens = 100;
  it("5.1) Should successfully purchase HXUI tokens and deduct SOL for tokens + ATA rent if the ATA doesn't exist", async () => {
    const tokenAddress = getHxuiTokenAddress(users[0].publicKey);
    const hxuiTokenAccountInfo = svm.getAccount(tokenAddress);

    assert.equal(hxuiTokenAccountInfo, null, "1");

    const userBalanceBefore = svm.getBalance(users[0].publicKey);
    const ix = getBuyTokensInstruction(
      { owner: users[0].publicKey },
      { amount: new anchor.BN(tokens) },
    );

    sendTransaction([ix], [users[0]]);
    const userBalanceAfter = svm.getBalance(users[0].publicKey);
    const hxuiTokenAccountDataAfter = getHxuiTokenAccountData(
      users[0].publicKey,
    );

    assert.equal(hxuiTokenAccountDataAfter.amount, BigInt(tokens), "2");

    const configAccountData = getConfigAccountData();
    const tokenAccountRent = svm.getBalance(tokenAddress);

    assert(
      configAccountData.price_per_token
        .mul(new anchor.BN(tokens))
        .add(new anchor.BN(tokenAccountRent))
        .eq(new anchor.BN(userBalanceBefore - userBalanceAfter)),
      "3",
    );

    const ix2 = getBuyTokensInstruction(
      { owner: users[1].publicKey },
      { amount: new anchor.BN(tokens) },
    );
    sendTransaction([ix2], [users[1]]);
  });

  it("5.2) Should successfully purchase HXUI tokens and only deduct SOL for the token cost when the ATA already exists", () => {
    const usersBalanceBefore = svm.getBalance(users[0].publicKey);

    const ix = getBuyTokensInstruction(
      { owner: users[0].publicKey },
      { amount: new anchor.BN(tokens) },
    );
    sendTransaction([ix], [users[0]]);
    const usersBalanceAfter = svm.getBalance(users[0].publicKey);

    const hxuiTokenAccountData = getHxuiTokenAccountData(users[0].publicKey);
    assert.equal(hxuiTokenAccountData.amount, BigInt(2 * tokens), "1");

    const configAccountData = getConfigAccountData();
    assert(
      configAccountData.price_per_token
        .mul(new anchor.BN(tokens))
        .eq(new anchor.BN(usersBalanceBefore - usersBalanceAfter)),
      "2",
    );
  });
});

describe("5) HxuiCandidate creation, Voting candiate, Picking winner, Active HxuiCandidate verioius lifecycles.", () => {
  before(async () => {
    const ixs: TransactionInstruction[] = [];
    for (let i = 0; i < users.length; i++) {
      const tokenCreationIx = createAssociatedTokenAccountInstruction(
        users[i].publicKey,
        getHxuiLiteTokenAddress(users[i].publicKey),
        users[i].publicKey,
        getPda(SEEDS.hxuiLiteMint).address,
        TOKEN_2022_PROGRAM_ID,
      );
      const registerIx = getRegisterForFreeTokensInstruction({
        owner: users[i].publicKey,
      });
      const mintIx = getMintFreeTokensInstruction({
        owner: users[i].publicKey,
      });
      ixs.push(tokenCreationIx, registerIx, mintIx);
    }
    sendTransaction(ixs, [liteAuthority, ...users]);

    const configAccountData = getConfigAccountData();
    for (let i = 0; i < users.length; i++) {
      const hxuiLiteTokenAccountData = getHxuiLiteTokenAccountData(
        users[i].publicKey,
      );
      assert(
        hxuiLiteTokenAccountData.mint.equals(
          getPda(SEEDS.hxuiLiteMint).address,
        ),
        "before-1",
      );
      assert(
        hxuiLiteTokenAccountData.owner.equals(users[i].publicKey),
        "before-2",
      );
      assert.equal(
        new anchor.BN(hxuiLiteTokenAccountData.amount).eq(
          configAccountData.free_tokens_per_mint,
        ),
        true,
        "before-3",
      );
    }

    for (let i = 0; i < 24; i++) {
      const clock = svm.getClock();
      clock.unixTimestamp =
        clock.unixTimestamp +
        BigInt(configAccountData.free_mint_cool_down.toNumber());
      svm.setClock(clock);
      const ixs = [];
      for (let i = 0; i < users.length - 1; i++) {
        const mintIx = getMintFreeTokensInstruction({
          owner: users[i].publicKey,
        });
        ixs.push(mintIx);
      }
      const metadata = sendTransaction(ixs, [liteAuthority]);
      assert(metadata instanceof TransactionMetadata, "before-4");
    }
    for (let i = 0; i < users.length - 1; i++) {
      const hxuiLiteTokenAccountData = getHxuiLiteTokenAccountData(
        users[i].publicKey,
      );
      assert.equal(hxuiLiteTokenAccountData.amount, BigInt(25), "before-5");
    }
  });

  // users.length = 3
  // usersHXUITokenBalance = [200,100,0]
  // usersHXUILiteTokenBalance = [25,25,1]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]

  it("5.1) Should successfully create multiple active candidate accounts with varied claim-back settings", async () => {
    const candidateName = "Lorem ipsum dolor sit amet, 4321";
    const candidateDescription = "Lorem ipsum dolor sit amet...";

    assert(candidateName.length <= 32, "1");

    const candidateAddress = getCandidatePda(candidateName).address;
    const candidateBump = getCandidatePda(candidateName).bump;

    const adminBalanceBefore = svm.getBalance(adminPubkey);
    const dropTimeAccountDataBefore = getDropTimeAccountData();

    const ix = getCreateCandidateInstruction(
      { admin: adminPubkey },
      {
        name: candidateName,
        description: candidateDescription,
        enable_claim_back_offer: false,
      },
    );
    sendTransaction([ix], [admin]);

    const adminBalanceAfter = svm.getBalance(adminPubkey);
    const candidateBalance = svm.getBalance(candidateAddress);

    assert.equal(adminBalanceBefore - adminBalanceAfter, candidateBalance, "2");

    const candidateAccountData = getCandidateAccountData(candidateName);
    const dropTimeAccountDataAfter = getDropTimeAccountData();

    assert.equal(candidateAccountData.name, candidateName, "3");
    assert(!!candidateAccountData.status.Active, "4");
    assert.equal(candidateAccountData.claim_back_offer, false, "5");
    assert.equal(candidateAccountData.bump, candidateBump, "6");
    assert.equal(candidateAccountData.claim_deadline, 0, "7");
    assert.equal(candidateAccountData.vote_count, 0, "8");
    assert(candidateAccountData.receipt_count.eq(new anchor.BN(0)), "9");
    assert.equal(
      candidateAccountData.id,
      dropTimeAccountDataBefore.total_candidate_count,
      "10",
    );

    assert.equal(
      dropTimeAccountDataAfter.total_candidate_count -
        dropTimeAccountDataBefore.total_candidate_count,
      1,
      "11",
    );
    assert.equal(
      dropTimeAccountDataAfter.active_candidate_ids.length -
        dropTimeAccountDataBefore.active_candidate_ids.length,
      1,
      "12",
    );
    assert(
      dropTimeAccountDataAfter.active_candidate_ids.includes(
        candidateAccountData.id,
      ),
      "13",
    );

    activeCandidates.push({
      name: candidateName,
      description: candidateDescription,
      address: candidateAddress,
      bump: candidateBump,
    });

    for (let i = 1; i < 8; i++) {
      const name = "ABCD" + i;
      const ix = getCreateCandidateInstruction(
        { admin: adminPubkey },
        {
          name,
          description: "lorem ipsum",
          enable_claim_back_offer: i == 3 || i == 4 || i == 5,
        },
      );
      sendTransaction([ix], [admin]);
      activeCandidates.push({
        name,
        description: "lorem ipsum",
        ...getCandidatePda(name),
      });
    }

    for (let i = 0; i < activeCandidates.length; i++) {
      const candidateAccountData = getCandidateAccountData(
        activeCandidates[i].name,
      );
      assert(!!candidateAccountData.status.Active, "14");
      if (i == 3 || i == 4 || i == 5) {
        assert.equal(candidateAccountData.claim_back_offer, true, "15");
      } else {
        assert.equal(candidateAccountData.claim_back_offer, false, "16");
      }
    }
  });

  // users.length = 3
  // usersHXUITokenBalance = [200,100,0]
  // usersHXUILiteTokenBalance = [25,23,1]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),0,0,0,0,0,0,0]

  it("5.2) Should successfully cast a vote using free HXUI Lite tokens without creating a receipt", async () => {
    const votes = 1;
    const candidateAccountDataBefore = getCandidateAccountData(
      activeCandidates[0].name,
    );
    const hxuiLiteTokenAccountDataBefore = getHxuiLiteTokenAccountData(
      users[1].publicKey,
    );

    const ix = getVoteWithHxuiLiteInstruction(
      { owner: users[1].publicKey },
      { _name: activeCandidates[0].name, votes: new anchor.BN(votes) },
    );
    const metadata = sendTransaction([ix], [users[1]]);
    assert(metadata instanceof TransactionMetadata, "1");

    const candidateAccountDataAfter = getCandidateAccountData(
      activeCandidates[0].name,
    );
    assert(
      candidateAccountDataAfter.vote_count
        .sub(candidateAccountDataBefore.vote_count)
        .eq(new anchor.BN(votes)),
      "2",
    );

    const hxuiLiteTokenAccountDataAfter = getHxuiLiteTokenAccountData(
      users[1].publicKey,
    );
    const configAccountData = getConfigAccountData();
    assert(
      new anchor.BN(
        hxuiLiteTokenAccountDataBefore.amount -
          hxuiLiteTokenAccountDataAfter.amount,
      ).eq(configAccountData.tokens_per_vote.mul(new anchor.BN(votes))),
      "3",
    );
  });

  // usersHXUITokenBalance = [32,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),24(1),10(0),12(1),24(1),10(0),12(1)]

  it("5.3) Should handle bulk voting via both HXUI (paid) and HXUI Lite (free), routing rent for vote receipts from the vault", async () => {
    for (let i = 1; i < activeCandidates.length; i++) {
      if (i % 3 !== 0) {
        const user = users[0];
        const votes = (i % 3) * 12;

        const candidateAccountDataBefore = getCandidateAccountData(
          activeCandidates[i].name,
        );
        const hxuiTokenAccountDataBefore = getHxuiTokenAccountData(
          user.publicKey,
        );
        const expectedReceiptRent = svm.minimumBalanceForRentExemption(
          BigInt(21),
        );
        const vaultBalanceBefore = svm.getBalance(
          getPda(SEEDS.hxuiVault).address,
        );

        const ix = getVoteWithHxuiInstruction(
          { owner: user.publicKey },
          { name: activeCandidates[i].name, votes: new anchor.BN(votes) },
        );
        const metadata = sendTransaction([ix], [user]);
        assert(metadata instanceof TransactionMetadata, "1");

        const vaultBalanceAfter = svm.getBalance(
          getPda(SEEDS.hxuiVault).address,
        );
        const [voteReceiptData, voteReceiptAccountInfo] = getVoteReceipt(
          activeCandidates[i].name,
          user.publicKey,
        );

        assert.equal(voteReceiptAccountInfo.lamports, expectedReceiptRent, "2");
        assert.equal(
          vaultBalanceBefore - vaultBalanceAfter,
          voteReceiptAccountInfo.lamports,
          "3",
        );

        const candidateAccountDataAfter = getCandidateAccountData(
          activeCandidates[i].name,
        );
        const hxuiTokenAccountDataAfter = getHxuiTokenAccountData(
          user.publicKey,
        );

        assert(
          candidateAccountDataAfter.vote_count
            .sub(candidateAccountDataBefore.vote_count)
            .eq(new anchor.BN(votes)),
          "4",
        );

        const configAccountData = getConfigAccountData();
        const tokensSpent = new anchor.BN(
          hxuiTokenAccountDataBefore.amount - hxuiTokenAccountDataAfter.amount,
        );
        assert(
          tokensSpent.eq(
            configAccountData.tokens_per_vote.mul(new anchor.BN(votes)),
          ),
          "5",
        );
        assert.equal(voteReceiptData.id, candidateAccountDataAfter.id, "6");
        assert(voteReceiptData.tokens.eq(tokensSpent), "7");
      } else {
        const user = users[i / 3 - 1];
        const votes = 10;
        const candidateAccountDataBefore = getCandidateAccountData(
          activeCandidates[i].name,
        );
        const hxuiLiteTokenAccountDataBefore = getHxuiLiteTokenAccountData(
          user.publicKey,
        );

        const ix = getVoteWithHxuiLiteInstruction(
          { owner: user.publicKey },
          { _name: activeCandidates[i].name, votes: new anchor.BN(votes) },
        );
        const metadata = sendTransaction([ix], [user]);
        assert(metadata instanceof TransactionMetadata, "8");

        const candidateAccountDataAfter = getCandidateAccountData(
          activeCandidates[i].name,
        );
        const hxuiLiteTokenAccountDataAfter = getHxuiLiteTokenAccountData(
          user.publicKey,
        );

        assert(
          candidateAccountDataAfter.vote_count
            .sub(candidateAccountDataBefore.vote_count)
            .eq(new anchor.BN(votes)),
          "9",
        );
        assert(
          candidateAccountDataAfter.receipt_count
            .sub(candidateAccountDataBefore.receipt_count)
            .eq(new anchor.BN(0)),
          "10",
        );

        const configAccountData = getConfigAccountData();
        const tokensSpent = new anchor.BN(
          hxuiLiteTokenAccountDataBefore.amount -
            hxuiLiteTokenAccountDataAfter.amount,
        );
        assert(
          tokensSpent.eq(
            configAccountData.tokens_per_vote.mul(new anchor.BN(votes)),
          ),
          "11",
        );
      }
    }
  });

  // usersHXUITokenBalance = [30,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),25(1),10(0),12(1),24(1),10(0),12(1)]

  it("5.4) Should correctly update an existing vote receipt rather than creating a new one when voting multiple times for the same candidate", () => {
    const user = users[0];
    const candidateName = activeCandidates[2].name;
    const votes = new anchor.BN(1);

    const ix = getVoteWithHxuiInstruction(
      { owner: user.publicKey },
      { name: candidateName, votes },
    );
    const [voteReceiptDataBefore] = getVoteReceipt(
      candidateName,
      user.publicKey,
    );
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);

    sendTransaction([ix], [user]);

    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert.equal(vaultBalanceAfter, vaultBalanceBefore, "1");

    const [voteReceiptDataAfter] = getVoteReceipt(
      candidateName,
      user.publicKey,
    );
    const configAccountData = getConfigAccountData();
    assert(
      new anchor.BN(
        voteReceiptDataAfter.tokens - voteReceiptDataBefore.tokens,
      ).eq(votes.mul(configAccountData.tokens_per_vote)),
      "2",
    );
  });

  it("5.5) Should fail to close a candidate while their status is still 'Active'", async () => {
    const candidateName = activeCandidates[0].name;
    const candidateAccountData = getCandidateAccountData(candidateName);
    assert(candidateAccountData.status.Active, "1");
    assert.equal(candidateAccountData.receipt_count.isZero(), true, "2");

    const ix = getCloseCandidateInstruction({ _name: candidateName });
    const failed = sendTransaction([ix], [admin]);
    assertTxFailedWithErrorCode(failed, "CannotCloseActiveCandidate");
  });

  // usersHXUITokenBalance = [30,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [active(claimable),active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),25(1),10(0),12(1),24(1),10(0),12(1)]

  it("5.6) Should successfully enable a claim-back offer on an active candidate", () => {
    const candidateName = activeCandidates[0].name;
    const candidateAccountDataBefore = getCandidateAccountData(candidateName);
    assert(candidateAccountDataBefore.status.Active, "1");
    assert.equal(candidateAccountDataBefore.claim_back_offer, false, "2");

    const ix = getEnableClaimBackOfferInstruction({ _name: candidateName });
    sendTransaction([ix], [admin]);

    const candidateAccountDataAfter = getCandidateAccountData(candidateName);
    assert.equal(candidateAccountDataAfter.claim_back_offer, true, "3");
  });

  // users.length = 3
  // usersHXUITokenBalance = [30,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [withdrawn,withdrawn,withdrawn,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),25(1),10(0),12(1),24(1),10(0),12(1)]

  it("5.7) Should successfully change active candidates' statuses to 'Withdrawn'", async () => {
    for (let i = 0; i < 3; i++) {
      const candidateName = activeCandidates[i].name;
      const candidateAccountDataBefore = getCandidateAccountData(candidateName);
      assert(candidateAccountDataBefore.status.Active, "1");

      const ix = getWithdrawCandidateInstruction({ _name: candidateName });
      sendTransaction([ix], [admin]);

      const candidateAccountDataAfter = getCandidateAccountData(candidateName);
      assert(candidateAccountDataAfter.status.Withdrawn, "2");

      const dropTimeAccountData = getDropTimeAccountData();
      assert(
        !dropTimeAccountData.active_candidate_ids.includes(
          candidateAccountDataAfter.id,
        ),
        "3",
      );
      newCandidates.withdrawn.push(activeCandidates[i]);
    }
  });

  /*
    usersHXUITokenBalance = [30,100,0]
    usersHXUILiteTokenBalance = [5,3,1]
  activeCandidatesStatus = [withdrawn,withdrawn,withdrawn,winner(claimable),winner(claimable),winner(claimable),winner,winner]

   // activeCandidateVotesWithReceipts = [1(0),12(1),25(1),10(0),12(1),24(1),10(0),12(1)]

  newCandidates = {
      claimableWinner:[10(0),12(1),24(1)],
      winner:[10(0),12(1)],
      withdrawn:[1(0),12(1),25(1)]
    }
  newCandidates.claimableWinner[i] where i > 0 implies winner with claimable with ~ i * 12 votes.
  similarly for withdrawn and winner
  */

  it("5.8) Should correctly calculate and transition candidates with the most votes to 'Winner' or 'ClaimableWinner' after the poll deadline", async () => {
    const configAccountData = getConfigAccountData();
    for (let i = 0; i < 5; i++) {
      let expectedWinnerCandidateId: number = 0;
      let maxVotes: anchor.BN = new anchor.BN(0);
      let expectedWinnerIndex: number = 0;

      const candidatesMeta: AccountMeta[] = [];
      for (let j = 0; j < activeCandidates.length; j++) {
        const candidateAddress = activeCandidates[j].address;
        const candidateAccountData = getCandidateAccountData(
          activeCandidates[j].name,
        );

        if (
          candidateAccountData.status.Active &&
          candidateAccountData.vote_count.cmp(
            configAccountData.min_votes_to_win,
          ) !== -1
        ) {
          if (
            expectedWinnerCandidateId == 0 ||
            candidateAccountData.vote_count.cmp(maxVotes) == 1 ||
            (candidateAccountData.vote_count.cmp(maxVotes) == 0 &&
              candidateAccountData.id < expectedWinnerCandidateId)
          ) {
            expectedWinnerCandidateId = candidateAccountData.id;
            maxVotes = candidateAccountData.vote_count;
            expectedWinnerIndex = j;
          }
          candidatesMeta.push({
            pubkey: candidateAddress,
            isSigner: false,
            isWritable: true,
          });
        }
      }

      const dropTimeAccountDataBefore = getDropTimeAccountData();
      assert.equal(dropTimeAccountDataBefore.is_winner_drawn, false, "1");
      const now = svm.getClock();

      assert(
        dropTimeAccountDataBefore.drop_timestamp.cmp(now.unixTimestamp) == 1,
        "2",
      );

      now.unixTimestamp = BigInt(
        dropTimeAccountDataBefore.drop_timestamp.toNumber() + 1,
      );
      svm.setClock(now);

      assert(
        dropTimeAccountDataBefore.drop_timestamp.cmp(
          new anchor.BN(now.unixTimestamp),
        ) == -1,
        "3",
      );
      const ix = getDrawWinnerInstruction(candidatesMeta);
      sendTransaction([ix]);

      const dropTimeAccountDataAfter = getDropTimeAccountData();
      assert.equal(dropTimeAccountDataAfter.is_winner_drawn, true, "4");

      const winnerCandidateAccountData = getCandidateAccountData(
        activeCandidates[expectedWinnerIndex].name,
      );

      if (winnerCandidateAccountData.claim_back_offer) {
        assert(!!winnerCandidateAccountData.status.ClaimableWinner, "5");
        assert(
          expectedWinnerIndex == 3 ||
            expectedWinnerIndex == 4 ||
            expectedWinnerIndex == 5,
          "6",
        );
        newCandidates.claimableWinner.unshift(
          activeCandidates[expectedWinnerIndex],
        );
      } else {
        assert(!!winnerCandidateAccountData.status.Winner, "7");
        assert(
          !(
            expectedWinnerIndex == 3 ||
            expectedWinnerIndex == 4 ||
            expectedWinnerIndex == 5
          ),
          "8",
        );
        newCandidates.winner.unshift(activeCandidates[expectedWinnerIndex]);
      }

      assert(
        !dropTimeAccountDataAfter.active_candidate_ids.includes(
          expectedWinnerCandidateId,
        ),
        "9",
      );

      const pollDeadline = new anchor.BN(now.unixTimestamp + BigInt(7 * 86400));
      const ix2 = getSetDropTimeInstruction({ new_drop_time: pollDeadline });
      sendTransaction([ix2], [admin]);
    }
  });

  it(
    "5.9) Should fail to set a claim-back offer if the candidate is no longer 'Active'",
  );
});

describe("Advance candidate testing", () => {
  it("6.1) Should fail to withdraw a candidate that has already been declared a Winner or ClaimableWinner", async () => {
    function withdrawCandidate(nonActiveCandidateName: string) {
      const ix = getWithdrawCandidateInstruction({
        _name: nonActiveCandidateName,
      });
      const failed = sendTransaction([ix], [admin]);
      assertTxFailedWithErrorCode(failed, "InactiveCandidateWithdrawal");
    }
    withdrawCandidate(newCandidates.winner[0].name);
    withdrawCandidate(newCandidates.claimableWinner[0].name);
  });

  it("6.2) Should fail to cast votes for any candidate that is not currently 'Active'", async () => {
    function voteANonActiveCandidate(nonActiveCandidateName: string) {
      const ix = getVoteWithHxuiLiteInstruction(
        { owner: users[1].publicKey },
        { _name: nonActiveCandidateName, votes: new anchor.BN(1) },
      );
      const failed = sendTransaction([ix], [users[1]]);
      assertTxFailedWithErrorCode(failed, "InactiveCandidateVoted.");
    }

    voteANonActiveCandidate(newCandidates.winner[0].name);
    voteANonActiveCandidate(newCandidates.claimableWinner[0].name);
    voteANonActiveCandidate(newCandidates.withdrawn[0].name);
  });

  function claimTokensForNonActiveCandidate(
    nonActiveCandidateName: string,
    owner: Keypair,
    state: { hasZeroReceipts: boolean; while: "before" | "during" | "after" },
  ) {
    checkNonActiveCandidateWith(nonActiveCandidateName, state);
    const voteReceiptAddress = getVoteReceiptPda(
      nonActiveCandidateName,
      owner.publicKey,
    ).address;
    const voteReceiptAccountInfo = svm.getAccount(voteReceiptAddress);
    assert(voteReceiptAccountInfo != null, "claim-helper-1");

    const ix = getClaimBackTokensInstruction(
      { owner: owner.publicKey },
      { _name: nonActiveCandidateName },
    );
    return sendTransaction([ix], [owner]);
  }

  it("6.3) Should fail to claim back spent HXUI tokens before the admin formally opens the withdrawal window", async () => {
    const failed = claimTokensForNonActiveCandidate(
      newCandidates.winner[1].name,
      users[0],
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed, "IneligibleForTokenClaim");

    const failed2 = claimTokensForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      users[0],
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed2, "OutsideClaimBackWindow");

    const failed3 = claimTokensForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      users[0],
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed3, "OutsideClaimBackWindow");
  });

  function closeNonActiveCandidate(
    nonActiveCandidateName: string,
    state: { hasZeroReceipts: boolean; while: "before" | "during" | "after" },
  ) {
    checkNonActiveCandidateWith(nonActiveCandidateName, state);
    const ix = getCloseCandidateInstruction({ _name: nonActiveCandidateName });
    return sendTransaction([ix], [admin]);
  }

  it("6.4) Should fail to close candidates with outstanding vote receipts before the withdrawal window is opened", () => {
    const failed1 = closeNonActiveCandidate(newCandidates.winner[1].name, {
      hasZeroReceipts: false,
      while: "before",
    });
    assertTxFailedWithErrorCode(failed1, "PendingReceiptsExist");

    const failed2 = closeNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed2, "ClaimBackWindowNotOpen");

    const failed3 = closeNonActiveCandidate(newCandidates.withdrawn[1].name, {
      hasZeroReceipts: false,
      while: "before",
    });
    assertTxFailedWithErrorCode(failed3, "ClaimBackWindowNotOpen");
  });

  function clearReceiptForNonActiveCandidate(
    nonActiveCandidateName: string,
    state: { while: "during" | "after" | "before"; hasZeroReceipts: boolean },
  ) {
    checkNonActiveCandidateWith(nonActiveCandidateName, state);
    const voteReceiptAddress = getVoteReceiptPda(
      nonActiveCandidateName,
      users[0].publicKey,
    ).address;
    const allVoteReceipts = [voteReceiptAddress];
    const ixs: TransactionInstruction[] = [];

    for (let i = 0; i < allVoteReceipts.length; i++) {
      const ix = getCloseVoteReceiptInstruction(
        { voteReceipt: allVoteReceipts[0] },
        { _name: nonActiveCandidateName },
      );
      ixs.push(ix);
    }
    return sendTransaction(ixs, [admin]);
  }

  // newCandidates.winner[1] HAS 0 RECEIPTS NOW. USE IT WITH CONSIDERTION.
  // newCandidates = {
  //     claimableWinner:[10(0),12(1),24(1)],
  //     winner:[10(0),12(0)],
  //     withdrawn:[1(0),12(1),25(1)]
  //   }

  it("6.5) Should fail to clear user vote receipts before the withdrawal window is opened", async () => {
    try {
      const candidateName = newCandidates.winner[1].name;
      const candidateAccountDataBefore = getCandidateAccountData(candidateName);
      const voteReceiptAddress = getVoteReceiptPda(
        candidateName,
        users[0].publicKey,
      ).address;

      const vaultBalanceBefore = svm.getBalance(
        getPda(SEEDS.hxuiVault).address,
      );
      const receiptBalanceBefore = svm.getBalance(voteReceiptAddress);
      const hxuiTokenAccountDataBefore = getHxuiTokenAccountData(
        users[0].publicKey,
      );

      clearReceiptForNonActiveCandidate(candidateName, {
        while: "before",
        hasZeroReceipts: false,
      });

      const candidateAccountDataAfter = getCandidateAccountData(candidateName);
      const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
      const hxuiTokenAccountDataAfter = getHxuiTokenAccountData(
        users[0].publicKey,
      );
      const voteReceiptAccountInfoAfter = svm.getAccount(voteReceiptAddress);

      assert.equal(voteReceiptAccountInfoAfter, null, "1");
      assert.equal(
        vaultBalanceAfter - vaultBalanceBefore,
        receiptBalanceBefore,
        "2",
      );
      assert(
        candidateAccountDataBefore.receipt_count
          .sub(candidateAccountDataAfter.receipt_count)
          .eq(new anchor.BN(1)),
        "3",
      );
      assert.equal(
        hxuiTokenAccountDataBefore.amount,
        hxuiTokenAccountDataAfter.amount,
        "4",
      );
    } catch (err) {
      assert(false, "5");
    }
    const failed = clearReceiptForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { while: "before", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed, "ClaimBackWindowNotOpen.");

    const failed2 = clearReceiptForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      { while: "before", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed2, "ClaimBackWindowNotOpen.");
  });

  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(1),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(1),25(1)]
  //   }

  it("6.6) Should successfully close non-active candidates immediately if they have zero user vote receipts", async () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const candidateBalance = svm.getBalance(newCandidates.winner[1].address);
    const result = closeNonActiveCandidate(newCandidates.winner[1].name, {
      hasZeroReceipts: true,
      while: "before",
    });

    if (result instanceof FailedTransactionMetadata) assert(false, "1");

    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert.equal(vaultBalanceAfter - vaultBalanceBefore, candidateBalance, "2");

    const winnerCandidateAccountInfo = svm.getAccount(
      newCandidates.winner[1].address,
    );
    assert.equal(winnerCandidateAccountInfo, null, "3");

    const result2 = closeNonActiveCandidate(
      newCandidates.claimableWinner[0].name,
      { hasZeroReceipts: true, while: "before" },
    );
    const result3 = closeNonActiveCandidate(newCandidates.withdrawn[0].name, {
      hasZeroReceipts: true,
      while: "before",
    });

    if (
      result2 instanceof FailedTransactionMetadata ||
      result3 instanceof FailedTransactionMetadata
    ) {
      assert(false, "4");
    }
  });

  function openWithdrawWindowForNonActiveCandidate(
    nonActiveCandidateName: string,
    until: anchor.BN,
  ) {
    const ix = getOpenClaimBackWindowInstruction({
      _name: nonActiveCandidateName,
      until,
    });
    return sendTransaction([ix], [admin]);
  }

  it("6.7) Should successfully open a withdrawal window for Withdrawn or ClaimableWinner candidates, but fail for standard Winners", () => {
    const now = svm.getClock();
    let until = new anchor.BN(now.unixTimestamp).add(new anchor.BN(14 * 86400));
    const failed = openWithdrawWindowForNonActiveCandidate(
      newCandidates.winner[0].name,
      until,
    );
    assertTxFailedWithErrorCode(failed, "ZeroReceiptsImmediateClose");

    const metadata = openWithdrawWindowForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      until,
    );
    if (metadata instanceof FailedTransactionMetadata) assert(false, "1");

    const metadata2 = openWithdrawWindowForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      until,
    );
    if (metadata2 instanceof FailedTransactionMetadata) assert(false, "2");
  });

  // NO CHANGE
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(1),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(1),25(1)]
  //   }

  it("6.8) Should prevent the admin from clearing vote receipts while the withdrawal window is actively open", async () => {
    const failed = clearReceiptForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { while: "during", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed, "ClaimBackWindowStillOpen");

    const failed2 = clearReceiptForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      { while: "during", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed2, "ClaimBackWindowStillOpen");
  });

  // NO CHANGE
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(1),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(1),25(1)]
  //   }

  it("6.9) Should prevent the admin from closing candidate accounts while the withdrawal window is actively open", async () => {
    const failed = closeNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { hasZeroReceipts: false, while: "during" },
    );
    assertTxFailedWithErrorCode(failed, "ClaimBackWindowStillOpen");

    const failed2 = closeNonActiveCandidate(newCandidates.withdrawn[1].name, {
      hasZeroReceipts: false,
      while: "during",
    });
    assertTxFailedWithErrorCode(failed2, "ClaimBackWindowStillOpen");
  });

  // newCandidates.claimableWinner[1] AND newCandidates.withdrawn[1] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0),25(1)]
  //   }

  it("6.10) Should successfully refund 100% of spent HXUI to voters and close their receipts during the active withdrawal window", async () => {
    const hxuiTokenAccountDataBefore = getHxuiTokenAccountData(
      users[0].publicKey,
    );
    const [voteReceiptData, voteReceiptAccountInfo] = getVoteReceipt(
      newCandidates.claimableWinner[1].name,
      users[0].publicKey,
    );
    const candidateAccountDataBefore = getCandidateAccountData(
      newCandidates.claimableWinner[1].name,
    );
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);

    claimTokensForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      users[0],
      { hasZeroReceipts: false, while: "during" },
    );

    const candidateAccountDataAfter = getCandidateAccountData(
      newCandidates.claimableWinner[1].name,
    );
    assert(
      candidateAccountDataBefore.receipt_count
        .sub(candidateAccountDataAfter.receipt_count)
        .eq(new anchor.BN(1)),
      "1",
    );

    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const hxuiTokenAccountDataAfter = getHxuiTokenAccountData(
      users[0].publicKey,
    );

    assert(
      new anchor.BN(
        hxuiTokenAccountDataAfter.amount - hxuiTokenAccountDataBefore.amount,
      ).eq(voteReceiptData.tokens.div(new anchor.BN(2))),
      "2",
    );

    const voteReceiptAccountInfoAfter = svm.getAccount(
      getVoteReceiptPda(
        newCandidates.claimableWinner[1].name,
        users[0].publicKey,
      ).address,
    );
    assert.equal(voteReceiptAccountInfoAfter, null, "3");
    assert.equal(
      vaultBalanceAfter - vaultBalanceBefore,
      voteReceiptAccountInfo.lamports,
      "4",
    );

    claimTokensForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      users[0],
      { hasZeroReceipts: false, while: "during" },
    );
    const hxuiTokenAccountDataFinally = getHxuiTokenAccountData(
      users[0].publicKey,
    );
    assert(
      new anchor.BN(
        hxuiTokenAccountDataFinally.amount - hxuiTokenAccountDataAfter.amount,
      ).eq(voteReceiptData.tokens),
      "5",
    );
  });

  // newCandidates.claimableWinner[1] AND newCandidates.withdrawn[1] RECEIPTS ARE CLEARED AND CLOSED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(1)]
  //   }

  it("6.11) Should still prevent the admin from closing candidate accounts during the window even if there are zero receipts", async () => {
    const result = closeNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { hasZeroReceipts: true, while: "during" },
    );
    const result2 = closeNonActiveCandidate(newCandidates.withdrawn[1].name, {
      hasZeroReceipts: true,
      while: "during",
    });

    if (
      result instanceof FailedTransactionMetadata ||
      result2 instanceof FailedTransactionMetadata
    ) {
      assert(false, "1");
    }
  });

  it("6.12) Should allow the withdrawal window time to elapse organically (time-travel test)", async () => {
    const now = svm.getClock();
    const until = now.unixTimestamp + BigInt(14 * 86400);

    const result = openWithdrawWindowForNonActiveCandidate(
      newCandidates.withdrawn[2].name,
      new anchor.BN(until),
    );
    const result2 = openWithdrawWindowForNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      new anchor.BN(until),
    );

    if (
      result instanceof FailedTransactionMetadata ||
      result2 instanceof FailedTransactionMetadata
    ) {
      assert(false, "1");
    }
    now.unixTimestamp = until + BigInt(1);
    svm.setClock(now);

    checkNonActiveCandidateWith(newCandidates.withdrawn[2].name, {
      while: "after",
    });
    checkNonActiveCandidateWith(newCandidates.claimableWinner[2].name, {
      while: "after",
    });
  });

  it("6.13) Should fail to refund voters once the active withdrawal window has expired", async () => {
    const failed = claimTokensForNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      users[0],
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed, "OutsideClaimBackWindow");

    const failed2 = claimTokensForNonActiveCandidate(
      newCandidates.withdrawn[2].name,
      users[0],
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed2, "OutsideClaimBackWindow");
  });

  // NO CHANGE
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(1)]
  //   }

  it("6.14) Should fail to close the candidate account if there are still lingering uncleared vote receipts after the window closes", async () => {
    const failed = closeNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed, "PendingReceiptsExist");

    const failed2 = closeNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed2, "PendingReceiptsExist");
  });

  // newCandidates.claimableWinner[2] and newCandidates.withdrawn[2] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(0)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(0)]
  //   }

  it("6.15) Should allow the admin to sweep and clear all expired vote receipts once the window closes", async () => {
    const result = clearReceiptForNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      { hasZeroReceipts: false, while: "after" },
    );
    const result2 = clearReceiptForNonActiveCandidate(
      newCandidates.withdrawn[2].name,
      { hasZeroReceipts: false, while: "after" },
    );

    if (
      result instanceof FailedTransactionMetadata ||
      result2 instanceof FailedTransactionMetadata
    ) {
      assert(false, "1");
    }
  });

  // newCandidates.claimableWinner[2] and newCandidates.withdrawn[2] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(0,closed)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(0,closed)]
  //   }

  it("6.16) Should successfully close non-active candidates after a withdrawal window given ZERO receipts", async () => {
    const result = closeNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      { hasZeroReceipts: true, while: "after" },
    );
    const result2 = closeNonActiveCandidate(newCandidates.withdrawn[2].name, {
      hasZeroReceipts: true,
      while: "after",
    });

    if (
      result instanceof FailedTransactionMetadata ||
      result2 instanceof FailedTransactionMetadata
    ) {
      assert(false, "1");
    }
  });

  it(
    "6.17) Should fail to draw a winner when no active candidates have more than or equal to 10 votes",
  );
});

describe("7) Withdrawal and financing the vote receipts.", () => {
  function getMinimumVaultBalance() {
    const hxuiMintData = getHxuiMintData();
    const configAccountData = getConfigAccountData();
    return (
      svm.minimumBalanceForRentExemption(BigInt(0)) +
      BigInt(
        Math.floor(
          Number(hxuiMintData.supply) /
            configAccountData.tokens_per_vote.toNumber(),
        ),
      ) *
        svm.minimumBalanceForRentExemption(BigInt(21))
    );
  }

  it("7.1) Should fail to withdraw vault funds if the caller is not the admin", () => {
    const ix = getWithdrawVaultFundsInstruction();
    try {
      sendTransaction([ix], []);
      assert(false, "1");
    } catch (_) {
      assert(true, "2");
    }
  });

  it("7.2) Should successfully withdraw a specific allowed amount from the vault", () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const minimumVaultBalance = getMinimumVaultBalance();
    const maximumWithdrawAmount = vaultBalanceBefore - minimumVaultBalance;
    const withdrawAmount = new anchor.BN(maximumWithdrawAmount).divRound(
      new anchor.BN(2),
    );
    const adminBalanceBefore = svm.getBalance(adminPubkey);

    const ix = getWithdrawVaultFundsInstruction({ amount: withdrawAmount });
    sendTransaction([ix], [admin]);

    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert(
      new anchor.BN(vaultBalanceBefore - vaultBalanceAfter).eq(withdrawAmount),
      "1",
    );

    const adminBalanceAfter = svm.getBalance(adminPubkey);
    assert.equal(
      adminBalanceAfter - adminBalanceBefore,
      withdrawAmount.toNumber(),
      "2",
    );
  });

  it("7.3) Should fail to withdraw an amount greater than the vault's available balance", () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const minimumVaultBalance = getMinimumVaultBalance();
    const maximumWithdrawAmount = vaultBalanceBefore - minimumVaultBalance;
    const withdrawAmount = new anchor.BN(minimumVaultBalance)
      .divRound(new anchor.BN(2))
      .add(new anchor.BN(maximumWithdrawAmount));

    const ix = getWithdrawVaultFundsInstruction({ amount: withdrawAmount });
    const failed = sendTransaction([ix], [admin]);
    assertTxFailedWithErrorCode(failed, "VaultInsufficientFunds");
  });

  it("7.4) Should successfully withdraw the maximum possible amount from the vault when no specific amount is passed", () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const minimumVaultBalance = getMinimumVaultBalance();
    const maximumWithdrawAmount = vaultBalanceBefore - minimumVaultBalance;
    const adminBalanceBefore = svm.getBalance(adminPubkey);

    const ix = getWithdrawVaultFundsInstruction();
    sendTransaction([ix], [admin]);

    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert.equal(vaultBalanceAfter, minimumVaultBalance, "1");

    const adminBalanceAfter = svm.getBalance(adminPubkey);
    assert.equal(
      adminBalanceAfter - adminBalanceBefore,
      maximumWithdrawAmount,
      "2",
    );
  });
});

describe("8) Updating config", () => {
  it("8.1) Should successfully update the price per token in the config", () => {
    const newPricePerToken = price_per_token.mul(new anchor.BN(2));
    const updateConfigIx = getUpdateConfigInstruction(
      {},
      { price_per_token: newPricePerToken },
    );

    const configAccountDataBefore = getConfigAccountData();
    assert(configAccountDataBefore.price_per_token.eq(price_per_token), "1");

    const metadata = sendTransaction([updateConfigIx], [admin]);
    assert(metadata instanceof TransactionMetadata, "2");

    const configAccountDataAfter = getConfigAccountData();
    assert(configAccountDataAfter.price_per_token.eq(newPricePerToken), "3");
    assert(configAccountDataAfter.admin.equals(admin.publicKey), "4");
  });

  it("8.2) Should successfully update the admin pubkey along with the price per token", () => {
    const newAdmin = new Keypair();
    const newPricePerToken = price_per_token.mul(new anchor.BN(4));
    const updateConfigIx = getUpdateConfigInstruction(
      { new_admin: newAdmin },
      { price_per_token: newPricePerToken },
    );

    const configAccountDataBefore = getConfigAccountData();
    assert(
      configAccountDataBefore.price_per_token.eq(
        price_per_token.mul(new anchor.BN(2)),
      ),
      "1",
    );

    const metadata = sendTransaction([updateConfigIx], [admin, newAdmin]);
    assert(metadata instanceof TransactionMetadata, "2");

    const configAccountDataAfter = getConfigAccountData();
    assert(configAccountDataAfter.price_per_token.eq(newPricePerToken), "3");
    assert(configAccountDataAfter.admin.equals(newAdmin.publicKey), "4");
  });

  it("8.3) Should successfully delegate admin access for testing purposes", () => {
    const newAdmin = new Keypair();
    const getAdminAccessForTestingIx = getGetAdminAccessForTestingInstruction({
      newAdmin,
    });

    const metadata = sendTransaction([getAdminAccessForTestingIx], [newAdmin], {
      logIfFailed: true,
    });
    assert(metadata instanceof TransactionMetadata, "1");

    const configAccountDataAfter = getConfigAccountData();
    assert(configAccountDataAfter.admin.equals(newAdmin.publicKey), "2");
  });
});
