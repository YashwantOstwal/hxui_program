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
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
  type AccountInfo,
} from "@solana/web3.js";
import assert from "assert";
import bs58 from "bs58";
import {
  FailedTransactionMetadata,
  LiteSVM,
  TransactionMetadata,
} from "litesvm";
import IDL from "../target/idl/hxui.json" with { type: "json" };
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system.js";

const FREE_TOKENS_MINT_AMOUNT = 4;
const svm = new LiteSVM();
const programId = new PublicKey(IDL.address);
const payer = new Keypair();
svm.airdrop(payer.publicKey, BigInt(LAMPORTS_PER_SOL));

const coder = new anchor.BorshCoder(IDL as anchor.Idl);
const programPath = new URL("../target/deploy/hxui.so", import.meta.url)
  .pathname;
svm.addProgramFromFile(programId, programPath);
const price_per_token = new anchor.BN(0.001 * LAMPORTS_PER_SOL);
const tokens_per_vote = new anchor.BN(2);

const admin = new Keypair();

const adminPubkey = admin.publicKey;
svm.airdrop(adminPubkey, BigInt(LAMPORTS_PER_SOL));

const PDAs: Record<string, { address: PublicKey; bump: number }> = {};

const SEEDS: Record<string, string> = {
  hxuiVault: "hxui_vault",
  hxuiMint: "hxui_mint",
  hxuiConfig: "hxui_config",
  hxuiLiteMint: "hxui_lite_mint",
  hxuiPoll: "hxui_poll",
  hxuiFreeTokensCounter: "hxui_free_tokens_counter",
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

  if (options.logIfFailed && metadata instanceof FailedTransactionMetadata)
    console.log(metadata.meta().logs());
  svm.expireBlockhash();
  return metadata;
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
const liteAuthority = new Keypair();
describe("1) initialise_dapp instruction testing", () => {
  it("1.1) Inits the config account!", () => {
    const data = coder.instruction.encode("initialise_dapp", {
      price_per_token,
      tokens_per_vote,
    });
    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: adminPubkey, isSigner: true, isWritable: true },
        { pubkey: liteAuthority.publicKey, isSigner: false, isWritable: false },
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
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });

    sendTransaction([ix], [admin]);

    const hxuiConfigAccount = svm.getAccount(getPda(SEEDS.hxuiConfig).address);
    const hxuiConfigData = coder.accounts.decode(
      "Config",
      Buffer.from(hxuiConfigAccount.data),
    );

    //Config account validation.
    assert(hxuiConfigData.admin.equals(adminPubkey));
    assert(hxuiConfigData.tokens_per_vote.eq(tokens_per_vote));
    assert(hxuiConfigData.price_per_token.eq(price_per_token));
    assert.equal(hxuiConfigData.bump, getPda(SEEDS.hxuiConfig).bump);

    // Vault is initialised and funded with minimum lamports to exempt rent
    const rent = svm.minimumBalanceForRentExemption(BigInt(0));
    const vaultAccountBalance = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert.equal(vaultAccountBalance, rent);
  });
  it("1.2) Init fails for successive invocations", () => {
    //init fails after invoked once.
    const data = coder.instruction.encode("initialise_dapp", {
      price_per_token,
      tokens_per_vote,
    });
    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: adminPubkey, isSigner: true, isWritable: true },
        { pubkey: liteAuthority.publicKey, isSigner: false, isWritable: false },
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
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
    const failed = sendTransaction([ix], [admin]);
    if (failed instanceof FailedTransactionMetadata) {
      assert(true, "a");
    } else {
      assert(false, "b");
    }
  });
  it("1.3) Validating HXUI and HXUILite mint", () => {
    const hxuiMint = svm.getAccount(getPda(SEEDS.hxuiMint).address);

    assert.notEqual(hxuiMint, null, "HXUI mint does not exist");
    const hxuiMintData = unpackMint(
      getPda(SEEDS.hxuiMint).address,
      hxuiMint as AccountInfo<Buffer>,
      TOKEN_2022_PROGRAM_ID,
    );

    // mint is owned by token 2022 program
    assert(
      hxuiMint.owner.equals(TOKEN_2022_PROGRAM_ID),
      "HXUI mint is not owned by token-2022 program",
    );
    // //mint with 0 decimals, admin as hxui vault --> program controlled mint,and no freeze authority
    assert.equal(hxuiMintData.decimals, 0);

    assert(hxuiMintData.mintAuthority.equals(getPda(SEEDS.hxuiMint).address));
    assert(hxuiMintData.freezeAuthority === null);

    const hxuiLiteMint = svm.getAccount(getPda(SEEDS.hxuiLiteMint).address);
    const hxuiLiteMintData = unpackMint(
      getPda(SEEDS.hxuiLiteMint).address,
      hxuiLiteMint as AccountInfo<Buffer>,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.notEqual(hxuiLiteMint, null, "HXUILite mint does not exist");

    // mint is owned by token 2022 program
    assert(hxuiLiteMint.owner.equals(TOKEN_2022_PROGRAM_ID));
    assert.equal(hxuiLiteMintData.decimals, 0);

    // mint authority - > lite Authority
    assert(hxuiLiteMintData.mintAuthority.equals(liteAuthority.publicKey));
    assert(hxuiLiteMintData.freezeAuthority === null);
  });
});

describe("2) Poll creation testing", () => {
  it("2.1) Create Genesis poll", () => {
    const now = svm.getClock();
    const poll_deadline = new anchor.BN(now.unixTimestamp + BigInt(86400 * 7)); // 1 week from now.
    const adminBalanceBefore = svm.getBalance(adminPubkey);

    const data = coder.instruction.encode("create_poll", {
      poll_deadline,
    });

    const ix = new TransactionInstruction({
      programId,
      keys: [
        {
          pubkey: adminPubkey,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: getPda(SEEDS.hxuiConfig).address,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: getPda(SEEDS.hxuiPoll).address,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });

    sendTransaction([ix], [admin]);

    const adminBalanceAfter = svm.getBalance(adminPubkey);

    const pollRent = svm.getBalance(getPda(SEEDS.hxuiPoll).address);
    // admin paid for the poll rent.
    assert.equal(adminBalanceBefore - adminBalanceAfter, pollRent);

    const pollAccount = svm.getAccount(getPda(SEEDS.hxuiPoll).address);
    const pollAccountData = coder.accounts.decode(
      "Poll",
      Buffer.from(pollAccount.data),
    );

    assert(pollAccountData.current_poll_deadline.eq(poll_deadline));
    assert.equal(pollAccountData.current_poll_winner_drawn, false);
    assert.equal(pollAccountData.total_candidates, 0);
    assert.equal(pollAccountData.current_poll_candidates.length, 0);
    assert.equal(pollAccountData.bump, getPda(SEEDS.hxuiPoll).bump);
  });

  it("2.2) Cannot pick winner before poll ends", () => {
    const data = coder.instruction.encode("draw_winner", {});
    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: adminPubkey, isSigner: true, isWritable: false },
        {
          pubkey: getPda(SEEDS.hxuiConfig).address,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: getPda(SEEDS.hxuiPoll).address,
          isSigner: false,
          isWritable: true,
        },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = svm.latestBlockhash();
    tx.sign(payer, admin);

    const failed = svm.sendTransaction(tx);
    svm.expireBlockhash();

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("PollIsLive.") != -1);
    } else {
      assert(false);
    }
  });

  it("2.3) Cannot create a new poll before the poll ends", () => {
    const now = svm.getClock().unixTimestamp;
    const poll_deadline = new anchor.BN(now + BigInt(86400 * 8)); // 8 days from now.

    const data = coder.instruction.encode("create_poll", {
      poll_deadline,
    });

    const ix = new TransactionInstruction({
      programId,
      keys: [
        {
          pubkey: adminPubkey,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: getPda(SEEDS.hxuiConfig).address,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: getPda(SEEDS.hxuiPoll).address,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
    const failed = sendTransaction([ix], [admin]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("PollIsLive.") != -1);
    } else {
      assert(false);
    }
  });
  it("2.5) Attempt to create a new poll even after the poll has ended but the winner is not drawn yet. FAILS", () => {
    let clock = svm.getClock();
    clock.unixTimestamp = clock.unixTimestamp + BigInt(7 * 86400 + 1); // Time travelling to the next second after the end of poll.
    svm.setClock(clock);

    const pollAccount = svm.getAccount(getPda(SEEDS.hxuiPoll).address);
    const pollAccountData = coder.accounts.decode(
      "Poll",
      Buffer.from(pollAccount.data),
    );

    // Ensuring the poll has ended.
    assert(
      clock.unixTimestamp > pollAccountData.current_poll_deadline.toNumber(),
    );

    const now = clock.unixTimestamp;
    const poll_deadline = new anchor.BN(now + BigInt(86400 * 7));
    const data = coder.instruction.encode("create_poll", {
      poll_deadline,
    });

    const ix = new TransactionInstruction({
      programId,
      keys: [
        {
          pubkey: adminPubkey,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: getPda(SEEDS.hxuiConfig).address,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: getPda(SEEDS.hxuiPoll).address,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = svm.latestBlockhash();
    tx.sign(payer, admin);
    const failed = svm.sendTransaction(tx);
    svm.expireBlockhash();

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("WinnerNotDrawn.") != -1);
    } else {
      assert(false);
    }
  });

  it(" Winner for current poll is drawn");
  it(
    "A new poll can be created but failed due to deadline being smaller than the current time",
  );
  it("2.8) A new poll created.");
});

const [mintedTimestampAddressForAdmin, mintedTimestampBump] =
  PublicKey.findProgramAddressSync(
    [Buffer.from("minted_timestamp"), admin.publicKey.toBuffer()],
    programId,
  );

describe("4) Testing 4", () => {
  const adminHxuiLiteTokenAddress = getHxuiLiteTokenAddress(adminPubkey);
  it("4.1) Registration for minting free HXUILite tokens without an HXUILite Tokena account. for admin", () => {
    //associated token account does not exist
    const tokenAccount = svm.getAccount(adminHxuiLiteTokenAddress);
    assert.equal(
      tokenAccount,
      null,
      "HXUILite token account owned by admin exists.",
    );

    const adminBalanceBefore = svm.getBalance(adminPubkey);

    const ix = getRegisterForFreeTokens({ for: adminPubkey });

    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = svm.latestBlockhash();
    tx.sign(payer, admin);
    const status = svm.sendTransaction(tx);

    if (status instanceof FailedTransactionMetadata) {
      assert(false);
    } else {
      assert(true);
    }

    const adminBalanceAfter = svm.getBalance(adminPubkey);

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );

    assert.equal(
      mintedTimestampAccount.lamports,
      adminBalanceBefore - adminBalanceAfter,
    );

    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeTokenTimestamp",
      Buffer.from(mintedTimestampAccount.data),
    );

    assert.equal(mintedTimestampAccountData.next_mintable_timestamp, 0);
    assert.equal(mintedTimestampAccountData.closable_timestamp, 0);
    assert.equal(mintedTimestampAccountData.bump, mintedTimestampBump);
  });

  // it("4.2) Attempt to Mint free tokens without lite mint authority",  () => {
  //   const data = coder.instruction.encode("mint_free_tokens", {});

  //   const ix = new TransactionInstruction({
  //     programId,
  //     keys: [
  //       { pubkey: adminPubkey, isSigner: false, isWritable: false },
  //       // { pubkey: liteAuthority.publicKey, isSigner: true, isWritable: false },
  //       {
  //         pubkey: mintedTimestampAddressForAdmin,
  //         isSigner: false,
  //         isWritable: true,
  //       },
  //       { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
  //     ],
  //     data,
  //   });

  //   const tx = new Transaction().add(ix);
  //   tx.feePayer = payer.publicKey;
  //   tx.recentBlockhash = svm.latestBlockhash();
  //   tx.sign(payer, admin);
  //   const status = svm.sendTransaction(tx);

  //   if (status instanceof FailedTransactionMetadata) {
  //     assert(false);
  //   } else {
  //     assert(true);
  //   }
  //   try {
  //     await program.methods
  //       .mintFreeTokens()
  //       .accounts({
  //         owner: admin.publicKey,
  //         liteAuthority: liteAuthority.publicKey,
  //       })
  //       .rpc();
  //     assert(false);
  //   } catch (err) {
  //     assert(true);
  //   }
  // });

  it("4.3) Attempt to Mint free token without an associated token account for admin. FAILS", () => {
    const ix = getMintFreeTokensInstruction({ to: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("AccountNotInitialized.") != -1);
    } else {
      assert(false);
    }
  });
  it("4.4) Mint free token after creating an associated token account for admin. PASSES", () => {
    const creationIx = createAssociatedTokenAccountInstruction(
      adminPubkey,
      getHxuiLiteTokenAddress(adminPubkey),
      adminPubkey,
      getPda(SEEDS.hxuiLiteMint).address,
      TOKEN_2022_PROGRAM_ID,
    );

    const mintIx = getMintFreeTokensInstruction({ to: adminPubkey });

    const freeTokensCounterDataBefore = getFreeTokensCounterAccount();
    sendTransaction([creationIx, mintIx], [admin, liteAuthority]);
    const freeTokensCounterDataAfter = getFreeTokensCounterAccount();

    assert(
      freeTokensCounterDataBefore.remaining_free_tokens
        .sub(freeTokensCounterDataAfter.remaining_free_tokens)
        .eq(new anchor.BN(FREE_TOKENS_MINT_AMOUNT)),
      "lo",
    );
    // advance checking if is_new_epoch.

    const adminTokenAccount = svm.getAccount(adminHxuiLiteTokenAddress);

    assert.notEqual(adminTokenAccount, null);

    // owner program is token 2022.
    assert(adminTokenAccount.owner.equals(TOKEN_2022_PROGRAM_ID));

    const tokenState = getHxuiLiteAccount(adminPubkey);

    //  Admin is the owner
    assert(tokenState.owner.equals(admin.publicKey));

    // the token balance is 0n
    assert.equal(tokenState.amount, BigInt(FREE_TOKENS_MINT_AMOUNT));

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );
    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeTokenTimestamp",
      Buffer.from(mintedTimestampAccount.data),
    );

    const now = svm.getClock().unixTimestamp;
    assert(
      mintedTimestampAccountData.next_mintable_timestamp.eq(
        new anchor.BN(now + BigInt(43200)),
      ),
    );
    assert(mintedTimestampAccountData.closable_timestamp.eq(new anchor.BN(0)));
    assert.equal(mintedTimestampAccountData.bump, mintedTimestampBump);
  });
  it("4.5) Attempt to Mint free token to admin before cooldown. FAILS", () => {
    // token account exists.
    const ix = getMintFreeTokensInstruction({ to: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("RateLimitExceeded.") != -1);
    } else {
      assert(false);
    }
  });
  it("4.6) Attempt to claim back the rent before unregistering", () => {
    const ix = getClaimRegistrationFeesInstruction({ for: adminPubkey });
    const failed = sendTransaction([ix], [admin]);

    assertTxFailedWithErrorCode(failed, "UnregisterFirst");
  });
  it("4.7) Trigger Unregister for admin before cooldown ", () => {
    const ix = getUnregisterForFreeTokensInstruction({ for: adminPubkey });
    const failed = sendTransaction([ix], [admin]);
    if (failed instanceof FailedTransactionMetadata) {
      console.log(failed.meta().logs());
    }

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );
    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeTokenTimestamp",
      Buffer.from(mintedTimestampAccount.data),
    );

    const now = svm.getClock().unixTimestamp;
    assert(
      mintedTimestampAccountData.next_mintable_timestamp.eq(
        new anchor.BN(now + BigInt(43200)),
      ),
    );

    // One can close this account and claim back the rent after the cooldown.
    assert(
      mintedTimestampAccountData.closable_timestamp.eq(
        new anchor.BN(mintedTimestampAccountData.next_mintable_timestamp),
      ),
    );
  });

  it("4.8) Attempt to mint new tokens after unregistering. FAILS", () => {
    const ix = getMintFreeTokensInstruction({ to: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);

    assertTxFailedWithErrorCode(failed, "UnregisteredFreeTokens");
  });
  it("4.9) Attempt to Claim rent after unregistering but before closable time.", async () => {
    //Closable time in this situation is last minted time + 12 hours.
    const data = coder.instruction.encode("claim_registration_fees", {});
    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: adminPubkey, isSigner: true, isWritable: true },
        {
          pubkey: mintedTimestampAddressForAdmin,
          isSigner: false,
          isWritable: true,
        },
      ],
      data,
    });

    const failed = sendTransaction([ix], [admin]);

    assertTxFailedWithErrorCode(failed, "UnregisterFirst");
  });

  it("4.10) Cancel unregister", async () => {
    const data = coder.instruction.encode(
      "cancel_unregister_for_free_tokens",
      {},
    );
    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: adminPubkey, isSigner: true, isWritable: false },
        {
          pubkey: mintedTimestampAddressForAdmin,
          isSigner: false,
          isWritable: true,
        },
      ],
      data,
    });

    sendTransaction([ix], [admin]);

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );
    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeTokenTimestamp",
      Buffer.from(mintedTimestampAccount.data),
    );
    assert(mintedTimestampAccountData.closable_timestamp.eq(new anchor.BN(0)));
  });
  it("4.11) Mint free tokens to admin token account after cooldown", () => {
    const now = svm.getClock();
    now.unixTimestamp = now.unixTimestamp + BigInt(43200);
    svm.setClock(now); // time travelling ahead to the time where the admin can mint new tokens.
    const ix = getMintFreeTokensInstruction({ to: adminPubkey });

    const tokenStateBefore = getHxuiLiteAccount(adminPubkey);
    const freeTokensCounterDataBefore = getFreeTokensCounterAccount();
    sendTransaction([ix], [liteAuthority]);

    const tokenStateAfter = getHxuiLiteAccount(adminPubkey);
    const freeTokensCounterDataAfter = getFreeTokensCounterAccount();

    assert.equal(
      tokenStateAfter.amount - tokenStateBefore.amount,
      BigInt(FREE_TOKENS_MINT_AMOUNT),
    );
    assert(
      freeTokensCounterDataBefore.remaining_free_tokens
        .sub(freeTokensCounterDataAfter.remaining_free_tokens)
        .eq(new anchor.BN(FREE_TOKENS_MINT_AMOUNT)),
    );

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );
    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeTokenTimestamp",
      Buffer.from(mintedTimestampAccount.data),
    );

    assert(
      mintedTimestampAccountData.next_mintable_timestamp.eq(
        new anchor.BN(now.unixTimestamp + BigInt(43200)),
      ),
    );
    assert(mintedTimestampAccountData.closable_timestamp.eq(new anchor.BN(0)));
  });

  it("4.12) Unregister after cooldown allows to claim registration fees immediately", async () => {
    const now = svm.getClock();
    now.unixTimestamp = now.unixTimestamp + BigInt(43200);
    svm.setClock(now);
    const unregisterIx = getUnregisterForFreeTokensInstruction({
      for: adminPubkey,
    });
    const claimRegistrationFeesIx = getClaimRegistrationFeesInstruction({
      for: adminPubkey,
    });

    const mintedTimestampAccountBalance = svm.getBalance(
      mintedTimestampAddressForAdmin,
    );
    const adminBalanceBefore = svm.getBalance(adminPubkey);
    sendTransaction([unregisterIx, claimRegistrationFeesIx], [admin]);
    const adminBalanceAfter = svm.getBalance(adminPubkey);

    assert.equal(
      adminBalanceAfter - adminBalanceBefore,
      mintedTimestampAccountBalance,
    );
  });
  const users: Keypair[] = [];
  it("4.13) Attempt to mint more free tokens than can be minted per epoch", async () => {
    // Situation when more users attempt to mint free tokens than can be minted.

    const freeTokensCounter = getFreeTokensCounterAccount();
    const buffer = Math.floor(Math.random() * 3);
    // attempt to mint free tokens for one + buffer users.
    for (
      let i = 0;
      i <=
      freeTokensCounter.remaining_free_tokens.toNumber() /
        FREE_TOKENS_MINT_AMOUNT +
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

      const registerIx = getRegisterForFreeTokens({ for: user.publicKey });
      const mintIx = getMintFreeTokensInstruction({ to: user.publicKey });

      const metadata = sendTransaction(
        [registerIx, tokenCreationIx, mintIx],
        [user, liteAuthority],
      );

      if (metadata instanceof FailedTransactionMetadata) {
        assertTxFailedWithErrorCode(metadata, "AllFreeTokensForTheDayMinted");
        // minting will fail from x+1 user if x are the tokens that can be minted.
        assert(
          i >=
            Math.floor(
              freeTokensCounter.remaining_free_tokens.toNumber() /
                FREE_TOKENS_MINT_AMOUNT,
            ),
          "b",
        );
      } else {
        assert(
          i <
            Math.floor(
              freeTokensCounter.remaining_free_tokens.toNumber() /
                FREE_TOKENS_MINT_AMOUNT,
            ),
          "a",
        );
        const tokenAccount = getHxuiLiteAccount(user.publicKey);
        assert.equal(tokenAccount.amount, BigInt(FREE_TOKENS_MINT_AMOUNT));
      }
    }
  });
  it("Free tokens can be minted from the next epoch", () => {
    const freeTokensCounter = getFreeTokensCounterAccount();

    //minting have failed in the previous test and will fail when minted in this epoch
    assert(
      freeTokensCounter.remaining_free_tokens.cmp(
        new anchor.BN(FREE_TOKENS_MINT_AMOUNT),
      ) == -1,
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

    const registerIx = getRegisterForFreeTokens({ for: user.publicKey });
    const mintIx = getMintFreeTokensInstruction({ to: user.publicKey });

    const metadata = sendTransaction(
      [registerIx, tokenCreationIx, mintIx],
      [user, liteAuthority],
    );

    if (metadata instanceof FailedTransactionMetadata) {
      assert(false);
    } else {
      assert(true);
    }
    // assertTxFailedWithErrorCode(metadata, "", true);
  });
});

function getRegisterForFreeTokens(accounts: { for: PublicKey }) {
  const data = coder.instruction.encode("register_for_free_tokens", {});
  const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("minted_timestamp"), accounts.for.toBuffer()],
    programId,
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.for, isSigner: true, isWritable: true },
      {
        pubkey: mintedTimestampAddress,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getClaimRegistrationFeesInstruction(accounts: { for: PublicKey }) {
  const data = coder.instruction.encode("claim_registration_fees", {});
  const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("minted_timestamp"), accounts.for.toBuffer()],
    programId,
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.for, isSigner: true, isWritable: true },
      {
        pubkey: mintedTimestampAddress,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getUnregisterForFreeTokensInstruction(accounts: { for: PublicKey }) {
  const data = coder.instruction.encode("unregister_for_free_tokens", {});
  const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("minted_timestamp"), accounts.for.toBuffer()],
    programId,
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.for, isSigner: true, isWritable: false },
      {
        pubkey: mintedTimestampAddress,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}
function getMintFreeTokensInstruction(accounts: { to: PublicKey }) {
  const tokenAddress = getHxuiLiteTokenAddress(accounts.to);

  const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("minted_timestamp"), accounts.to.toBuffer()],
    programId,
  );

  const data = coder.instruction.encode("mint_free_tokens", {});

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.to, isSigner: false, isWritable: false },
      { pubkey: liteAuthority.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: tokenAddress,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getPda(SEEDS.hxuiLiteMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: mintedTimestampAddress,
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

function getHxuiMint() {
  const hxuiMintAddress = getPda(SEEDS.hxuiMint).address;
  const hxuiMintInfo = svm.getAccount(hxuiMintAddress);
  return unpackMint(
    hxuiMintAddress,
    hxuiMintInfo as AccountInfo<Buffer>,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getHxuiLiteMint() {
  const mintAddress = getPda(SEEDS.hxuiLiteMint).address;
  const mintInfo = svm.getAccount(mintAddress);
  return unpackMint(
    mintAddress,
    mintInfo as AccountInfo<Buffer>,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getHxuiLiteAccount(owner: PublicKey) {
  const tokenAddress = getHxuiLiteTokenAddress(owner);
  const tokenInfo = svm.getAccount(tokenAddress);

  return unpackAccount(
    tokenAddress,
    tokenInfo as AccountInfo<Buffer>,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getFreeTokensCounterAccount() {
  const address = getPda(SEEDS.hxuiFreeTokensCounter).address;
  const accountInfo = svm.getAccount(address);
  const accountData = coder.accounts.decode(
    "FreeTokensCounter",
    Buffer.from(accountInfo.data),
  );
  return accountData;
}

function assertTxFailedWithErrorCode(
  failed: FailedTransactionMetadata | TransactionMetadata,
  errorCode: string,
  printLogs: boolean = false,
) {
  if (failed instanceof TransactionMetadata)
    return assert(false, "Transaction did not fail");
  const logs = failed.meta().logs();
  if (printLogs) {
    console.log(logs);
  }
  for (const log of logs) {
    if (log.search("Error Code: " + errorCode) == -1) return assert(true);
  }
  return assert(
    false,
    `Transaction failed but not with this ${errorCode} code.`,
  );
}
