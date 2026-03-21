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

const svm = new LiteSVM();
const programId = new PublicKey(IDL.address);
const payer = new Keypair();
svm.airdrop(payer.publicKey, BigInt(LAMPORTS_PER_SOL));

const coder = new anchor.BorshCoder(IDL as anchor.Idl);
const programPath = new URL(
  "../target/deploy/hxui.so",
  //@ts-ignore
  import.meta.url,
).pathname;
svm.addProgramFromFile(programId, programPath);
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

const admin = new Keypair();

const adminPubkey = admin.publicKey;
svm.airdrop(adminPubkey, BigInt(LAMPORTS_PER_SOL));

const PDAs: Record<string, { address: PublicKey; bump: number }> = {};

const SEEDS: Record<string, string> = {
  hxuiVault: "hxui_vault",
  hxuiMint: "hxui_mint",
  hxuiConfig: "hxui_config",
  hxuiLiteMint: "hxui_lite_mint",
  hxuiPoll: "hxui_drop_time",
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
describe("1) init_dui instruction testing", () => {
  it("1.1) Inits the config account!", () => {
    const data = coder.instruction.encode("init_dui", {
      price_per_token,
      tokens_per_vote,
      free_tokens_per_mint,
      free_mints_per_epoch,
      free_mint_cool_down,
      min_votes_to_win,
    });
    const ix = new TransactionInstruction({
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
          pubkey: getPda(SEEDS.hxuiPoll).address,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });

    const failed = sendTransaction([ix], [admin, liteAuthority], {
      logIfFailed: true,
    });

    if (failed instanceof FailedTransactionMetadata) {
      console.log("failed");
    }

    const hxuiConfigAccount = svm.getAccount(getPda(SEEDS.hxuiConfig).address);
    const hxuiConfigData = coder.accounts.decode(
      "HxuiConfig",
      Buffer.from(hxuiConfigAccount.data),
    );

    //HxuiConfig account validation.
    assert(hxuiConfigData.admin.equals(adminPubkey));
    assert(hxuiConfigData.tokens_per_vote.eq(tokens_per_vote));
    assert(hxuiConfigData.price_per_token.eq(price_per_token));
    assert(hxuiConfigData.free_tokens_per_mint.eq(free_tokens_per_mint));
    assert(hxuiConfigData.free_mints_per_epoch.eq(free_mints_per_epoch));
    assert(hxuiConfigData.free_mint_cool_down.eq(free_mint_cool_down));
    assert(hxuiConfigData.min_votes_to_win.eq(min_votes_to_win));

    assert.equal(hxuiConfigData.bump, getPda(SEEDS.hxuiConfig).bump);

    // Vault is initialised and funded with minimum lamports to exempt rent
    const rent = svm.minimumBalanceForRentExemption(BigInt(0));
    const vaultAccountBalance = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert.equal(vaultAccountBalance, rent);
  });
  it("1.2) Init fails for successive invocations", () => {
    //init fails after invoked once.
    const data = coder.instruction.encode("init_dui", {
      price_per_token,
      tokens_per_vote,
      free_tokens_per_mint,
      free_mints_per_epoch,
      free_mint_cool_down,
      min_votes_to_win,
    });
    const ix = new TransactionInstruction({
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
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
    const failed = sendTransaction([ix], [admin, liteAuthority]);
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

  it("1.4) HxuiDropTime account created.", () => {
    const pollAccountData = getPollAccount();
    assert(pollAccountData !== null, "1");
    assert(pollAccountData.drop_timestamp.isZero(), "2");
    assert.equal(pollAccountData.is_winner_drawn, false, "3");
    assert.equal(pollAccountData.total_candidate_count, 0);
    assert.equal(pollAccountData.active_candidate_ids.length, 0);
    assert.equal(pollAccountData.bump, getPda(SEEDS.hxuiPoll).bump);
  });
});

describe("2) HxuiDropTime creation testing", () => {
  it("2.1) Creating a Genesis poll with valid deadline.", () => {
    const now = svm.getClock();
    const new_drop_time = new anchor.BN(now.unixTimestamp + BigInt(86400 * 7)); // 1 week from now.
    // const adminBalanceBefore = svm.getBalance(adminPubkey);

    const data = coder.instruction.encode("set_drop_time", {
      new_drop_time,
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
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    sendTransaction([ix], [admin]);

    const pollAccountData = getPollAccount();

    assert(pollAccountData.drop_timestamp.eq(new_drop_time));
    assert.equal(pollAccountData.is_winner_drawn, false);
    assert.equal(pollAccountData.total_candidate_count, 0);
    assert.equal(pollAccountData.active_candidate_ids.length, 0);
    assert.equal(pollAccountData.bump, getPda(SEEDS.hxuiPoll).bump);
  });

  it("2.2) Cannot pick winner before poll ends", () => {
    const data = coder.instruction.encode("draw_winner", {});
    const ix = new TransactionInstruction({
      programId,
      keys: [
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

    const failed = sendTransaction([ix]);
    assertTxFailedWithErrorCode(failed, "DrawTimeNotReached");
  });

  it("2.3) Cannot create a new poll before the poll ends", () => {
    const now = svm.getClock().unixTimestamp;
    const pollDeadline = new anchor.BN(now + BigInt(86400 * 8)); // 8 days from now.

    const ix = getCreatePollInstruction({ pollDeadline });
    const failed = sendTransaction([ix], [admin]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("DrawTimeNotReached.") != -1);
    } else {
      assert(false);
    }
  });
  it("2.5) Attempt to create a new poll even after the poll has ended but the winner is not drawn yet. FAILS", () => {
    let clock = svm.getClock();
    clock.unixTimestamp = clock.unixTimestamp + BigInt(7 * 86400 + 1); // Time travelling to the next second after the end of poll.
    svm.setClock(clock);

    const pollAccountData = getPollAccount();
    // Ensuring the poll has ended.
    assert(clock.unixTimestamp > pollAccountData.drop_timestamp.toNumber());

    const now = clock.unixTimestamp;
    const poll_deadline = new anchor.BN(now + BigInt(86400 * 7));
    const data = coder.instruction.encode("set_drop_time", {
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
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
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
      assert(failed.meta().logs()[2].search("PendingWinnerDraw.") != -1);
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
    [Buffer.from("free_mint_tracker"), admin.publicKey.toBuffer()],
    programId,
  );

describe("4) Testing 4", () => {
  const adminHxuiLiteTokenAddress = getHxuiLiteTokenAddress(adminPubkey);
  it("4.1) Registration for minting free HXUILite tokens without an HXUILite Token account for a user (admin as user)", () => {
    //associated token account does not exist
    const tokenAccount = svm.getAccount(adminHxuiLiteTokenAddress);
    assert.equal(
      tokenAccount,
      null,
      "HXUILite token account owned by admin exists.",
    );

    const adminBalanceBefore = svm.getBalance(adminPubkey);

    const ix = getRegisterForFreeTokensInstruction({ for: adminPubkey });

    const now = svm.getClock().unixTimestamp;
    sendTransaction([ix], [admin]);

    const adminBalanceAfter = svm.getBalance(adminPubkey);

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );

    assert.equal(
      mintedTimestampAccount.lamports,
      adminBalanceBefore - adminBalanceAfter,
    );

    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeMintTracker",
      Buffer.from(mintedTimestampAccount.data),
    );

    assert.equal(mintedTimestampAccountData.next_mint_timestamp, now);
    assert.equal(mintedTimestampAccountData.unregistered, false);
    assert.equal(mintedTimestampAccountData.bump, mintedTimestampBump);
  });

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

    const configAccount = getConfigAccount();
    assert(
      freeTokensCounterDataBefore.remaining_free_mints
        .sub(freeTokensCounterDataAfter.remaining_free_mints)
        .eq(new anchor.BN(configAccount.free_tokens_per_mint)),
    );
    // TODO: if is_new_epoch.

    const adminTokenAccount = svm.getAccount(adminHxuiLiteTokenAddress);

    assert.notEqual(adminTokenAccount, null);

    // owner program is token 2022.
    assert(adminTokenAccount.owner.equals(TOKEN_2022_PROGRAM_ID));

    const tokenState = getHxuiLiteAccount(adminPubkey);

    //  Admin is the owner
    assert(tokenState.owner.equals(admin.publicKey));

    // the token balance is 0n

    assert.equal(tokenState.amount, configAccount.free_tokens_per_mint);

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );
    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeMintTracker",
      Buffer.from(mintedTimestampAccount.data),
    );
    configAccount.free_mint_cool_down.toNumber();
    const now = svm.getClock().unixTimestamp;
    assert(
      mintedTimestampAccountData.next_mint_timestamp.eq(
        new anchor.BN(now).add(configAccount.free_mint_cool_down),
        "lorem",
      ),
    );
    assert(!mintedTimestampAccountData.unregistered, "lorem2");
    assert.equal(
      mintedTimestampAccountData.bump,
      mintedTimestampBump,
      "lorem232",
    );
  });
  it("4.5) Attempt to Mint free token to admin before cooldown. FAILS", () => {
    // token account exists.
    const ix = getMintFreeTokensInstruction({ to: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);

    if (failed instanceof FailedTransactionMetadata) {
      assert(failed.meta().logs()[2].search("MintCooldownActive.") != -1);
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
      "FreeMintTracker",
      Buffer.from(mintedTimestampAccount.data),
    );

    const configAccount = getConfigAccount();
    const now = svm.getClock().unixTimestamp;
    assert(
      mintedTimestampAccountData.next_mint_timestamp.eq(
        new anchor.BN(now).add(configAccount.free_mint_cool_down),
      ),
    );

    // One can close this account and claim back the rent after the cooldown.
    assert(mintedTimestampAccountData.unregistered);
  });

  it("4.8) Attempt to mint new tokens after unregistering. FAILS", () => {
    const ix = getMintFreeTokensInstruction({ to: adminPubkey });
    const failed = sendTransaction([ix], [liteAuthority]);

    assertTxFailedWithErrorCode(failed, "UnregisteredForFreeTokens.");
  });
  it("4.9) Attempt to Claim rent after unregistering but before closable time.", async () => {
    //Closable time in this situation is last minted time + 12 hours.
    const data = coder.instruction.encode("claim_registration_deposit", {});
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

    assertTxFailedWithErrorCode(failed, "UnclaimableYet.");
  });

  it("4.10) Cancel unregister", async () => {
    const data = coder.instruction.encode(
      "cancel_deregister_from_free_mint",
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
      "FreeMintTracker",
      Buffer.from(mintedTimestampAccount.data),
    );
    assert(!mintedTimestampAccountData.unregistered);
  });
  it("4.11) Mint free tokens to admin token account after cooldown", () => {
    const now = svm.getClock();

    const configAccount = getConfigAccount();
    now.unixTimestamp =
      now.unixTimestamp + BigInt(configAccount.free_mint_cool_down.toNumber());
    svm.setClock(now); // time travelling ahead to the time where the admin can mint new tokens.
    const ix = getMintFreeTokensInstruction({ to: adminPubkey });

    const tokenStateBefore = getHxuiLiteAccount(adminPubkey);
    const freeTokensCounterDataBefore = getFreeTokensCounterAccount();
    sendTransaction([ix], [liteAuthority]);

    const tokenStateAfter = getHxuiLiteAccount(adminPubkey);
    const freeTokensCounterDataAfter = getFreeTokensCounterAccount();
    assert.equal(
      tokenStateAfter.amount - tokenStateBefore.amount,
      BigInt(configAccount.free_tokens_per_mint),
    );
    assert(
      freeTokensCounterDataBefore.remaining_free_mints
        .sub(freeTokensCounterDataAfter.remaining_free_mints)
        .eq(new anchor.BN(configAccount.free_tokens_per_mint)),
    );

    const mintedTimestampAccount = svm.getAccount(
      mintedTimestampAddressForAdmin,
    );
    const mintedTimestampAccountData = coder.accounts.decode(
      "FreeMintTracker",
      Buffer.from(mintedTimestampAccount.data),
    );

    assert(
      mintedTimestampAccountData.next_mint_timestamp.eq(
        new anchor.BN(now.unixTimestamp).add(configAccount.free_mint_cool_down),
      ),
    );
    assert(!mintedTimestampAccountData.unregistered);
  });

  it("4.12) Unregister after cooldown allows to claim registration fees immediately", async () => {
    const now = svm.getClock();

    const configAccount = getConfigAccount();
    now.unixTimestamp =
      now.unixTimestamp + BigInt(configAccount.free_mint_cool_down.toNumber());
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

  it("4.13) Attempt to mint more free tokens than can be minted per epoch", async () => {
    // Situation when more users attempt to mint free tokens than can be minted.

    const freeTokensCounter = getFreeTokensCounterAccount();
    const buffer = Math.floor(Math.random() * 3);
    // attempt to mint free tokens for more users than can be minted for.

    const configAccount = getConfigAccount();
    for (
      let i = 0;
      i <=
      freeTokensCounter.remaining_free_mints.toNumber() /
        configAccount.free_tokens_per_mint +
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
        for: user.publicKey,
      });
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
              freeTokensCounter.remaining_free_mints.toNumber() /
                configAccount.free_tokens_per_mint,
            ),
          "b",
        );
      } else {
        assert(
          i <
            Math.floor(
              freeTokensCounter.remaining_free_mints.toNumber() /
                configAccount.free_tokens_per_mint,
            ),
          "a",
        );
        const tokenAccount = getHxuiLiteAccount(user.publicKey);
        assert.equal(tokenAccount.amount, configAccount.free_tokens_per_mint);
      }
    }
  }).slow(5000);
  it("Free tokens can be minted to users from the next epoch", () => {
    const freeTokensCounter = getFreeTokensCounterAccount();

    //minting have failed in the previous test and will fail when minted in this epoch
    const configAccount = getConfigAccount();
    configAccount.free_tokens_per_mint;
    assert(
      freeTokensCounter.remaining_free_mints.cmp(
        new anchor.BN(configAccount.free_tokens_per_mint),
      ) == -1,
    );

    const clock = svm.getClock();
    clock.epoch = clock.epoch + BigInt(1);
    svm.setClock(clock); // time travel to next epoch

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
      for: user.publicKey,
    });
    const mintIx = getMintFreeTokensInstruction({ to: user.publicKey });

    const metadata = sendTransaction(
      [registerIx, tokenCreationIx, mintIx],
      [user, liteAuthority],
    );

    assert(metadata instanceof TransactionMetadata);
    const freeTokensCounterDataAfter = getFreeTokensCounterAccount();

    assert(
      freeTokensCounterDataAfter.remaining_free_mints.eq(
        new anchor.BN(configAccount.free_mints_per_epoch).sub(
          new anchor.BN(configAccount.free_tokens_per_mint),
        ),
      ),
    );

    assert(
      freeTokensCounterDataAfter.current_epoch
        .sub(freeTokensCounter.current_epoch)
        .eq(new anchor.BN(1)),
    );
  });
});
const users: Keypair[] = [];
describe("5) Buying HXUI tokens for users[0]", async () => {
  before(async () => {
    for (let i = 0; i < 3; i++) {
      const user = new Keypair();
      svm.airdrop(user.publicKey, BigInt(LAMPORTS_PER_SOL));
      users.push(user);
    }
  });

  const tokens = 100;
  it("users[0] and users[1] buys 100 HXUI tokens each without an associated token account.", async () => {
    const tokenAddress = getAssociatedTokenAddressSync(
      getPda(SEEDS.hxuiMint).address,
      users[0].publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const tokenAccountInfo = svm.getAccount(tokenAddress);

    // token account does not exist
    assert.equal(tokenAccountInfo, null);

    const userBalanceBefore = svm.getBalance(users[0].publicKey);

    const ix = getBuyPaidTokensInstruction(
      { owner: users[0].publicKey },
      { amount: new anchor.BN(tokens) },
    );

    sendTransaction([ix], [users[0]]);
    const userBalanceAfter = svm.getBalance(users[0].publicKey);

    const tokenAccountStateAfterPurchase = getHxuiAccount(users[0].publicKey);

    assert.equal(tokenAccountStateAfterPurchase.amount, BigInt(tokens));
    const hxuiConfigAccountInfo = svm.getAccount(
      getPda(SEEDS.hxuiConfig).address,
    );
    const hxuiConfigState = coder.accounts.decode(
      "HxuiConfig",
      Buffer.from(hxuiConfigAccountInfo.data),
    );
    const tokenAccountRent = svm.getBalance(tokenAddress);
    assert(
      hxuiConfigState.price_per_token
        .mul(new anchor.BN(tokens))
        .add(new anchor.BN(tokenAccountRent))
        .eq(new anchor.BN(userBalanceBefore - userBalanceAfter)),
    );

    const ix2 = getBuyPaidTokensInstruction(
      { owner: users[1].publicKey },
      { amount: new anchor.BN(tokens) },
    );
    sendTransaction([ix2], [users[1]]);
  });
  //  users[0] and users[1] has 100 HXUI tokens
  // x----------------------------x
  it("users[0] buying 100 HXUI tokens with an associated token account.", () => {
    const usersBalanceBefore = svm.getBalance(users[0].publicKey);

    const ix = getBuyPaidTokensInstruction(
      { owner: users[0].publicKey },
      { amount: new anchor.BN(tokens) },
    );
    sendTransaction([ix], [users[0]]);
    const usersBalanceAfter = svm.getBalance(users[0].publicKey);

    const tokenAccount = getHxuiAccount(users[0].publicKey);
    assert.equal(tokenAccount.amount, BigInt(2 * tokens));
    const hxuiConfigAccountInfo = svm.getAccount(
      getPda(SEEDS.hxuiConfig).address,
    );
    const hxuiConfigState = coder.accounts.decode(
      "HxuiConfig",
      Buffer.from(hxuiConfigAccountInfo.data),
    );
    assert(
      hxuiConfigState.price_per_token
        .mul(new anchor.BN(tokens))
        .eq(new anchor.BN(usersBalanceBefore - usersBalanceAfter)),
    );
  });
});

//  users[0] has 200 HXUI tokens and users[1] has 100 HXUI tokens
// x----------------------------x

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
        for: users[i].publicKey,
      });

      const mintIx = getMintFreeTokensInstruction({ to: users[i].publicKey });
      ixs.push(tokenCreationIx, registerIx, mintIx);
    }
    sendTransaction(ixs, [liteAuthority, ...users]);

    const configAccount = getConfigAccount();
    for (let i = 0; i < users.length; i++) {
      const hxuiLiteTokenAccount = getHxuiLiteAccount(users[i].publicKey);
      assert(
        hxuiLiteTokenAccount.mint.equals(getPda(SEEDS.hxuiLiteMint).address),
      );
      assert(hxuiLiteTokenAccount.owner.equals(users[i].publicKey));

      assert.equal(
        new anchor.BN(hxuiLiteTokenAccount.amount).eq(
          configAccount.free_tokens_per_mint,
        ),
        BigInt(1),
      );
    }

    //Minting free tokens for users[0] for testing.

    for (let i = 0; i < 24; i++) {
      const clock = svm.getClock();
      clock.unixTimestamp =
        clock.unixTimestamp +
        BigInt(configAccount.free_mint_cool_down.toNumber());
      svm.setClock(clock);
      const ixs = [];
      for (let i = 0; i < users.length - 1; i++) {
        const mintIx = getMintFreeTokensInstruction({ to: users[i].publicKey });
        ixs.push(mintIx);
      }
      const metadata = sendTransaction(ixs, [liteAuthority]);
      assert(metadata instanceof TransactionMetadata);
    }
    for (let i = 0; i < users.length - 1; i++) {
      const tokenAccount = getHxuiLiteAccount(users[i].publicKey);
      assert.equal(tokenAccount.amount, BigInt(25));
    }
  });

  // users.length = 3
  // usersHXUITokenBalance = [200,100,0]
  // usersHXUILiteTokenBalance = [25,25,1]

  it("5.1) Creating 8 candidates to test all scenarios.", async () => {
    const candidateName = "Lorem ipsum dolor sit amet, 4321";
    const candidateDescription =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in volu.";

    assert(candidateName.length <= 32);
    assert(candidateDescription.length <= 280);
    const [candidateAddress, candidateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("hxui_candidate"), Buffer.from(candidateName)],
      programId,
    );

    const adminBalanceBefore = svm.getBalance(adminPubkey);

    const pollAccountBefore = getPollAccount();

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

    const candidateAccountBalance = svm.getBalance(candidateAddress);
    assert.equal(
      adminBalanceBefore - adminBalanceAfter,
      candidateAccountBalance,
    );
    const candidateState = getCandidateAccount(candidateName);

    const pollAccountAfter = getPollAccount();

    assert.equal(candidateState.name, candidateName);
    assert.equal(candidateState.description, candidateDescription);
    assert(!!candidateState.status.Active);
    assert.equal(candidateState.claim_back_offer, false);
    assert.equal(candidateState.bump, candidateBump);
    assert.equal(candidateState.claim_deadline, 0);
    assert.equal(candidateState.vote_count, 0);
    assert(candidateState.receipt_count.eq(new anchor.BN(0)));
    assert.equal(candidateState.id, pollAccountBefore.total_candidate_count);

    // poll account state update.
    assert.equal(
      pollAccountAfter.total_candidate_count -
        pollAccountBefore.total_candidate_count,
      1,
    );
    assert.equal(
      pollAccountAfter.active_candidate_ids.length -
        pollAccountBefore.active_candidate_ids.length,
      1,
    );
    assert(pollAccountAfter.active_candidate_ids.includes(candidateState.id));

    activeCandidates.push({
      name: candidateName,
      description: candidateDescription,
      address: candidateAddress,
      bump: candidateBump,
    });

    // Creating the rest of the 7 candidates .
    for (let i = 1; i < 8; i++) {
      const name = "ABCD" + i;
      const description = "lorem ipsum";

      const ix = getCreateCandidateInstruction(
        { admin: adminPubkey },
        {
          name,
          description,
          enable_claim_back_offer: i == 3 || i == 4 || i == 5,
        },
      );
      sendTransaction([ix], [admin]);
      activeCandidates.push({
        name,
        description,
        ...getCandidatePda(name),
      });
    }

    // verifying activeCandidates[3..5] are claimable while rest are not.
    for (let i = 0; i < activeCandidates.length; i++) {
      const activeCandidateState = await getCandidateAccount(
        activeCandidates[i].name,
      );
      assert(!!activeCandidateState.status.Active, "Not an active candidate");
      if (i == 3 || i == 4 || i == 5) {
        assert.equal(
          activeCandidateState.claim_back_offer,
          true,
          "Not a claimable",
        );
      } else {
        assert.equal(
          activeCandidateState.claim_back_offer,
          false,
          "is Claimable",
        );
      }
    }
    // users.length = 3
    // usersHXUITokenBalance = [200,100,0]
    // usersHXUILiteTokenBalance = [25,25,1]
    // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  });
  it("5.2) users[1] gives 1 vote to activeCandidates[0] with HXUILite tokens", async () => {
    const votes = 1;

    const candidateAccountBefore = getCandidateAccount(
      activeCandidates[0].name,
    );
    const tokenAccountStateBefore = getHxuiLiteAccount(users[1].publicKey);

    const ix = getVoteCandidateWithHxuiLiteInstruction(
      { owner: users[1].publicKey },
      { _name: activeCandidates[0].name, votes: new anchor.BN(votes) },
    );
    const metadata = sendTransaction([ix], [users[1]]);
    assert(metadata instanceof TransactionMetadata);

    const candidateStateAfter = getCandidateAccount(activeCandidates[0].name);
    assert(
      candidateStateAfter.vote_count
        .sub(candidateAccountBefore.vote_count)
        .eq(new anchor.BN(votes)),
    );
    const tokenAccountStateAfter = getHxuiLiteAccount(users[1].publicKey);

    const hxuiConfigState = getConfigAccount();
    assert(
      new anchor.BN(
        tokenAccountStateBefore.amount - tokenAccountStateAfter.amount,
      ).eq(hxuiConfigState.tokens_per_vote.mul(new anchor.BN(votes))),
    );
  });

  // users.length = 3
  // usersHXUITokenBalance = [200,100,0]
  // usersHXUILiteTokenBalance = [25,23,1]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),0,0,0,0,0,0,0]

  it("5.2) users gives (0(0),12(1),24(1),10(0),12(1),24(1),10(0),12(1)) votes to candidates with HXUI paid tokens and HXUILite tokens. PDA vault as rent payer for receipts ().", async () => {
    for (let i = 1; i < activeCandidates.length; i++) {
      if (i % 3 !== 0) {
        const user = users[0];
        const votes = (i % 3) * 12;

        const candidateAccountBefore = getCandidateAccount(
          activeCandidates[i].name,
        );

        const tokenAccountBefore = getHxuiAccount(user.publicKey);

        const expectedReceiptRent = svm.minimumBalanceForRentExemption(
          BigInt(21),
        ); // 8 + 13
        const vaultBalanceBefore = svm.getBalance(
          getPda(SEEDS.hxuiVault).address,
        );
        const ix = getVoteCandidateInstruction(
          { owner: user.publicKey },
          {
            candidateName: activeCandidates[i].name,
            votes: new anchor.BN(votes),
          },
        );
        const metadata = sendTransaction([ix], [user]);
        assert(metadata instanceof TransactionMetadata);
        const vaultBalanceAfter = svm.getBalance(
          getPda(SEEDS.hxuiVault).address,
        );
        const [voteReceipt, receiptInfo] = getVoteReceipt(
          activeCandidates[i].name,
          user.publicKey,
        );

        assert.equal(receiptInfo.lamports, expectedReceiptRent);
        assert.equal(
          vaultBalanceBefore - vaultBalanceAfter,
          receiptInfo.lamports,
        );
        const candidateAccountAfter = getCandidateAccount(
          activeCandidates[i].name,
        );
        const tokenAccountAfter = getHxuiAccount(user.publicKey);

        assert(
          candidateAccountAfter.vote_count
            .sub(candidateAccountBefore.vote_count)
            .eq(new anchor.BN(votes)),
        );

        const config = getConfigAccount();

        const tokensSpent = new anchor.BN(
          tokenAccountBefore.amount - tokenAccountAfter.amount,
        );
        assert(
          tokensSpent.eq(config.tokens_per_vote.mul(new anchor.BN(votes))),
        );

        // Verifying the receipt.
        assert.equal(voteReceipt.id, candidateAccountAfter.id);

        // one receipt per voter per candidate. irrespective of votes.
        assert(voteReceipt.tokens.eq(tokensSpent));
      } else {
        // give 10 votes with free tokens to the candidates which should not create a receipt.
        const user = users[i / 3 - 1]; // i will either be 3 and 6
        const votes = 10;
        const candidateAccountBefore = getCandidateAccount(
          activeCandidates[i].name,
        );

        const tokenAccountBefore = getHxuiLiteAccount(user.publicKey);
        const ix = getVoteCandidateWithHxuiLiteInstruction(
          { owner: user.publicKey },
          {
            _name: activeCandidates[i].name,
            votes: new anchor.BN(votes),
          },
        );
        const metadata = sendTransaction([ix], [user]);
        assert(metadata instanceof TransactionMetadata);
        const candidateAccountAfter = getCandidateAccount(
          activeCandidates[i].name,
        );
        const tokenAccountAfter = getHxuiLiteAccount(user.publicKey);

        assert(
          candidateAccountAfter.vote_count
            .sub(candidateAccountBefore.vote_count)
            .eq(new anchor.BN(votes)),
        );
        assert(
          candidateAccountAfter.receipt_count
            .sub(candidateAccountBefore.receipt_count)
            .eq(new anchor.BN(0)),
          "A receipt was indeed created",
        );
        const config = getConfigAccount();

        const tokensSpent = new anchor.BN(
          tokenAccountBefore.amount - tokenAccountAfter.amount,
        );
        assert(
          tokensSpent.eq(config.tokens_per_vote.mul(new anchor.BN(votes))),
        );
      }
    }
  });
  // usersHXUITokenBalance = [32,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),24(1),10(0),12(1),24(1),10(0),12(1)]
  it("5.3) users[0] voting the previously voted candidate (activeCandidates[2]) does not create a new receipt rather mutates the old one.", () => {
    const user = users[0];
    const candidateName = activeCandidates[2].name;
    const votes = new anchor.BN(1);

    const ix = getVoteCandidateInstruction(
      { owner: user.publicKey },
      { candidateName, votes },
    );

    // receipt already exists, adding over the new votes.
    const [voteReceiptBefore] = getVoteReceipt(candidateName, user.publicKey);

    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    sendTransaction([ix], [user]);
    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);

    assert.equal(
      vaultBalanceAfter,
      vaultBalanceBefore,
      "Vault lost its lamports.",
    );

    const [voteReceiptAfter] = getVoteReceipt(candidateName, user.publicKey);
    const config = getConfigAccount();
    assert(
      new anchor.BN(voteReceiptAfter.tokens - voteReceiptBefore.tokens).eq(
        votes.mul(config.tokens_per_vote),
      ),
    );
  });
  // usersHXUITokenBalance = [30,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),25(1),10(0),12(1),24(1),10(0),12(1)]
  it("Attempt to close an Active candidate with 0 receipts (eg. activeCandidates[0]).", async () => {
    // Only a non active 0 receipts account can be closed.

    const candidateName = activeCandidates[0].name;
    const candidateState = getCandidateAccount(candidateName);
    assert(candidateState.status.Active, "Not an active candidate");

    assert.equal(
      candidateState.receipt_count.isZero(),
      true,
      "HxuiCandidate has non-zero receipts",
    );

    const ix = getCloseCandidateInstruction({ candidateName });
    const failed = sendTransaction([ix], [admin]);
    assertTxFailedWithErrorCode(failed, "ActiveCandidateCannotBeClosed");
  });

  it("5.4 Set claimback offer for an active candidate after initialisation", () => {
    const candidateName = activeCandidates[0].name;
    const candidateStateBefore = getCandidateAccount(candidateName);
    assert(candidateStateBefore.status.Active, "Not an active candidate");

    assert.equal(candidateStateBefore.claim_back_offer, false, "1");

    const ix = getClaimbackOfferInstruction({ candidateName });
    sendTransaction([ix], [admin]);
    const candidateStateAfter = getCandidateAccount(candidateName);
    assert.equal(candidateStateAfter.claim_back_offer, true, "2");
  });
  // usersHXUITokenBalance = [30,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [active(claimable),active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),25(1),10(0),12(1),24(1),10(0),12(1)]

  it("5.4) Withdraw the first 3 active candidates in activeCandidates.", async () => {
    //Also verified the activeCandidates[0..2] are unclaimble candidates with 0,1,2 votes respectively and are withdrawn.
    for (let i = 0; i < 3; i++) {
      const candidateName = activeCandidates[i].name;
      const candidateStateBefore = getCandidateAccount(candidateName);
      // const candidateBefore = await program.account.candidate.fetch(
      //   activeCandidate.address,
      // );
      assert(candidateStateBefore.status.Active);

      const ix = getWithdrawCandidateInstruction({ candidateName });
      sendTransaction([ix], [admin]);
      const candidateStateAfter = getCandidateAccount(candidateName);

      assert(candidateStateAfter.status.Withdrawn);

      const pollAccount = getPollAccount();
      assert(
        !pollAccount.active_candidate_ids.includes(candidateStateAfter.id),
      );
      newCandidates.withdrawn.push(activeCandidates[i]);
    }

    //No longer active candidates.
    activeCandidates.slice(3);
  });
  // users.length = 3
  // usersHXUITokenBalance = [30,100,0]
  // usersHXUILiteTokenBalance = [5,3,1]
  // activeCandidatesStatus = [withdrawn,withdrawn,withdrawn,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),12(1),25(1),10(0),12(1),24(1),10(0),12(1)]

  it("5.5) Picking 5 winners (all the 5 left active candidates) immediately after the end of each poll by time travelling.", async () => {
    const configAccount = getConfigAccount();
    for (let i = 0; i < 5; i++) {
      let expectedWinnerCandidateId: number;
      let maxVotes: anchor.BN = new anchor.BN(0);
      let expectedWinnerIndex: number;

      const candidatesMeta: AccountMeta[] = [];
      for (let i = 0; i < activeCandidates.length; i++) {
        const candidateAddress = activeCandidates[i].address;

        const candidateAccount = getCandidateAccount(activeCandidates[i].name);
        if (
          candidateAccount.status.Active &&
          candidateAccount.vote_count.cmp(configAccount.min_votes_to_win) !== -1
        ) {
          if (
            expectedWinnerCandidateId == undefined ||
            candidateAccount.vote_count.cmp(maxVotes) == 1 ||
            (candidateAccount.vote_count.cmp(maxVotes) == 0 &&
              candidateAccount.id < expectedWinnerCandidateId)
          ) {
            expectedWinnerCandidateId = candidateAccount.id;
            maxVotes = candidateAccount.vote_count;
            expectedWinnerIndex = i;
          }
          candidatesMeta.push({
            pubkey: candidateAddress,
            isSigner: false,
            isWritable: true,
          });
        }
      }
      const pollAccountBefore = getPollAccount();
      assert.equal(pollAccountBefore.is_winner_drawn, false);
      const now = svm.getClock();

      // Deadline is ahead of the current time.
      assert(pollAccountBefore.drop_timestamp.cmp(now.unixTimestamp) == 1);

      // time travelling to next second after the poll has ended.
      now.unixTimestamp = BigInt(
        pollAccountBefore.drop_timestamp.toNumber() + 1,
      );
      svm.setClock(now);

      // We are just a second ahead of the deadline now.
      assert(
        pollAccountBefore.drop_timestamp.cmp(
          new anchor.BN(now.unixTimestamp),
        ) == -1,
      );
      const ix = getDrawWinnerInstruction(candidatesMeta);
      sendTransaction([ix]);

      const pollAccountAfter = getPollAccount();
      assert.equal(
        pollAccountAfter.is_winner_drawn,
        true,
        "HxuiDropTime state is not updated after drawWinner ixn.",
      );

      // verify the winner.
      const winnerCandidate = getCandidateAccount(
        activeCandidates[expectedWinnerIndex].name,
      );

      // Previously active -> winner or claimable winner.
      if (winnerCandidate.claim_back_offer) {
        assert(
          !!winnerCandidate.status.ClaimableWinner,
          "Not a claimable winner",
        );
        assert(
          expectedWinnerIndex == 3 ||
            expectedWinnerIndex == 4 ||
            expectedWinnerIndex == 5,
        );
        newCandidates.claimableWinner.unshift(
          activeCandidates[expectedWinnerIndex],
        );
      } else {
        assert(!!winnerCandidate.status.Winner, "Not a winner");
        assert(
          !(
            expectedWinnerIndex == 3 ||
            expectedWinnerIndex == 4 ||
            expectedWinnerIndex == 5
          ),
        );
        newCandidates.winner.unshift(activeCandidates[expectedWinnerIndex]);
      }

      assert(
        !pollAccountAfter.active_candidate_ids.includes(
          expectedWinnerCandidateId,
        ),
        "HxuiDropTime state still considers the winner as competing candidate",
      );

      // creating a new poll to draw more winners, only one winner per poll.
      const pollDeadline = new anchor.BN(now.unixTimestamp + BigInt(7 * 86400));
      const ix2 = getCreatePollInstruction({ pollDeadline });
      sendTransaction([ix2], [admin]);
    }
    //Garbage collected.
    // while (activeCandidates.length === 0) {
    //   activeCandidates.pop();
    // }
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
});

it("Attempt to set claimable winner for non active candidate");
function checkNonActiveCandidateWith(
  nonActiveCandidateName: string,
  expectedState: {
    while: "before" | "after" | "during";
    hasZeroReceipts?: boolean;
  },
) {
  const candidateState = getCandidateAccount(nonActiveCandidateName);

  assert(
    !candidateState.status.Active,
    "An active candidate is attempted to close",
  );

  if (typeof expectedState.hasZeroReceipts == "boolean") {
    if (expectedState.hasZeroReceipts) {
      assert.equal(
        candidateState.receipt_count.isZero(),
        true,
        "HxuiCandidate has non Zero receipts",
      );
    } else {
      assert.equal(
        candidateState.receipt_count.isZero(),
        false,
        "HxuiCandidate has Zero receipts",
      );
    }
  }

  const now = svm.getClock();
  switch (expectedState.while) {
    case "before":
      assert(
        candidateState.claim_deadline.eq(new anchor.BN(0)),
        "Claim window is either live or closed.",
      );
      break;
    case "during":
      assert(
        candidateState.claim_deadline.cmp(new anchor.BN(now.unixTimestamp)) !=
          -1,
        "Claim window is not yet started or closed",
      );
      break;

    case "after":
      assert.equal(
        candidateState.claim_deadline.isZero(),
        false,
        "Claim window is not yet opened.",
      );
      assert(
        candidateState.claim_deadline.cmp(new anchor.BN(now.unixTimestamp)) ==
          -1,
        "error: Claim window is live.",
      );
      break;
  }
}
describe("Advance candidate testing", () => {
  it("5.6) Cannot Withdraw a Winner or claimable winner candidate", async () => {
    // Only an active candidate can be withdrawn.

    async function withdrawCandidate(nonActiveCandidateName: string) {
      const ix = getWithdrawCandidateInstruction({
        candidateName: nonActiveCandidateName,
      });
      const failed = sendTransaction([ix], [admin]);
      assertTxFailedWithErrorCode(failed, "OnlyActiveCandidateCanBeWithdrawn");
    }
    withdrawCandidate(newCandidates.winner[0].name);
    withdrawCandidate(newCandidates.claimableWinner[0].name);
  });

  it("5.5) Cannot vote a Non active candidate (eg. Winner (candidates.winner[0]), Claimable Winner (candidates.claimableWinner[0]) or a Withdrawn (candidates.withdrawn[0])", async () => {
    async function voteANonActiveCandidate(nonActiveCandidateName: string) {
      const ix = getVoteCandidateWithHxuiLiteInstruction(
        { owner: users[1].publicKey },
        { _name: nonActiveCandidateName, votes: new anchor.BN(1) },
      );
      const failed = sendTransaction([ix], [users[1]]);
      assertTxFailedWithErrorCode(failed, "OnlyActiveCandidateCanBeVoted.");
    }

    voteANonActiveCandidate(newCandidates.winner[0].name);
    voteANonActiveCandidate(newCandidates.claimableWinner[0].name);
    voteANonActiveCandidate(newCandidates.withdrawn[0].name);
  });

  function getClaimTokensInstruction(
    accounts: Record<"owner", PublicKey>,
    instructionArgs: { candidateName: string },
  ) {
    const { candidateName: _name } = instructionArgs;
    const data = coder.instruction.encode("claim_back_tokens", { _name });
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
          pubkey: getCandidatePda(_name).address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: getPda(SEEDS.hxuiVault).address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: getVoteReceiptPda(_name, accounts.owner).address,
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
    const voteReceiptInfo = svm.getAccount(voteReceiptAddress);
    assert(voteReceiptInfo != null);
    const ix = getClaimTokensInstruction(
      { owner: owner.publicKey },
      { candidateName: nonActiveCandidateName },
    );
    const result = sendTransaction([ix], [owner]);
    return result;
  }
  it("5.3 Attempt to claim tokens for a non active candidate before a withdraw window given such candidates have NON-ZERO receipts.", async () => {
    // each candidate has exactly one receipt of users[0].
    const failed = claimTokensForNonActiveCandidate(
      newCandidates.winner[1].name,
      users[0],
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed, "TokensCannotBeClaimed");
    const failed2 = claimTokensForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      users[0],
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed2, "UnclaimableNow");

    const failed3 = claimTokensForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      users[0],
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed3, "UnclaimableNow");
  });

  // newCandidates = {
  //     claimableWinner:[10(0),12(1),24(1)],
  //     winner:[10(0),12(1)],
  //     withdrawn:[1(0),12(1),25(1)]
  //   }
  function closeNonActiveCandidate(
    nonActiveCandidateName: string,
    state: { hasZeroReceipts: boolean; while: "before" | "during" | "after" },
  ) {
    checkNonActiveCandidateWith(nonActiveCandidateName, state);

    const ix = getCloseCandidateInstruction({
      candidateName: nonActiveCandidateName,
    });
    const result = sendTransaction([ix], [admin]);
    return result;
  }
  it("Attempt to close non active candidates before a withdraw window given all candidates have NON-ZERO receipts.", () => {
    const failed1 = closeNonActiveCandidate(newCandidates.winner[1].name, {
      hasZeroReceipts: false,
      while: "before",
    });
    assertTxFailedWithErrorCode(failed1, "CloseAllReceiptAccount");

    const failed2 = closeNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { hasZeroReceipts: false, while: "before" },
    );
    assertTxFailedWithErrorCode(failed2, "OpenWithdrawWindowFirst");

    const failed3 = closeNonActiveCandidate(newCandidates.withdrawn[1].name, {
      hasZeroReceipts: false,
      while: "before",
    });
    assertTxFailedWithErrorCode(failed3, "OpenWithdrawWindowFirst");
  });

  // newCandidates = {
  //     claimableWinner:[10(0),12(1),24(1)],
  //     winner:[10(0),12(1)],
  //     withdrawn:[1(0),12(1),25(1)]
  //   }

  function getClearReceiptInstruction(
    accounts: Record<"voteReceipt", PublicKey>,
    instructionArgs: { candidateName: string },
  ) {
    const { candidateName: _name } = instructionArgs;
    const data = coder.instruction.encode("close_vote_receipt", { _name });
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
          pubkey: getCandidatePda(_name).address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: getPda(SEEDS.hxuiVault).address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: accounts.voteReceipt,
          isSigner: false,
          isWritable: true,
        },
      ],
      data,
    });
  }
  function clearReceiptForNonActiveCandidate(
    nonActiveCandidateName: string,
    state: {
      while: "during" | "after" | "before";
      hasZeroReceipts: boolean;
    },
  ) {
    checkNonActiveCandidateWith(nonActiveCandidateName, state);

    /*
    liteSVM does not have a .getProgramAccounts()method which will help us get all the vote receipts for a candidate by filtering them with VoteReceipt::DISCRIMINATOR and the candidate_id. The "crankscript.test.ts" this with anchor typescript client.

    const allVoteReceipts = await program.account.voteReceipt.all([
      {
        memcmp: {
          encoding: "base58",
          offset: 8,
          bytes: bs58.encode([candidateState.id]),
        },
      },
    ]);
      */

    //SIMULATING the above process, as we know the only voter with hxuiMint for any candidate is the users[0], so we will fetch its address and construct a response of above requrest - allVoteReceipts.

    const voteReceiptAddress = getVoteReceiptPda(
      nonActiveCandidateName,
      users[0].publicKey,
    ).address;
    const allVoteReceipts = [voteReceiptAddress]; // done.
    const ixs: TransactionInstruction[] = [];
    for (let i = 0; i < allVoteReceipts.length; i++) {
      const ix = getClearReceiptInstruction(
        { voteReceipt: allVoteReceipts[0] },
        { candidateName: nonActiveCandidateName },
      );
      ixs.push(ix);
    }
    const result = sendTransaction(ixs, [admin]);
    return result;
  }
  it("Attempt to clear receipts for non active candidates before a withdraw window given all candidates have NON-ZERO receipts.", async () => {
    try {
      // This should pass as the status of this candidate is winner with 1 receipt, it can be closed before the opening of withdraw window. In fact this candidate cannot open a withdraw window because no tokens will be minted back.
      const candidateName = newCandidates.winner[1].name;

      const candidateStateBefore = getCandidateAccount(candidateName);

      const voteReceiptAddress = getVoteReceiptPda(
        candidateName,
        users[0].publicKey,
      ).address;
      // const receiptAccountStateBefore = await program.account.voteReceipt.fetch(
      //   userReceiptAddress,
      // );

      const vaultBalanceBefore = svm.getBalance(
        getPda(SEEDS.hxuiVault).address,
      );
      const receiptBalanceBefore = svm.getBalance(voteReceiptAddress);

      const hxuiTokenAccountBefore = getHxuiAccount(users[0].publicKey);

      clearReceiptForNonActiveCandidate(candidateName, {
        while: "before",
        hasZeroReceipts: false,
      });

      const candidateStateAfter = getCandidateAccount(candidateName);
      const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);

      const hxuiTokenAccountAfter = getHxuiAccount(users[0].publicKey);

      const receiptAccountInfoAfter = svm.getAccount(voteReceiptAddress);

      assert.equal(receiptAccountInfoAfter, null);
      assert.equal(
        vaultBalanceAfter - vaultBalanceBefore,
        receiptBalanceBefore,
      );
      assert(
        candidateStateBefore.receipt_count
          .sub(candidateStateAfter.receipt_count)
          .eq(new anchor.BN(1)),
      );
      assert.equal(hxuiTokenAccountBefore.amount, hxuiTokenAccountAfter.amount);
    } catch (err) {
      assert(false);
    }
    const failed = clearReceiptForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { while: "before", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed, "OpenWithdrawWindowFirst.");
    const failed2 = clearReceiptForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      { while: "before", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed2, "OpenWithdrawWindowFirst.");
  });

  // newCandidates.winner[1] HAS 0 RECEIPTS NOW. USE IT WITH CONSIDERTION.
  // newCandidates = {
  //     claimableWinner:[10(0),12(1),24(1)],
  //     winner:[10(0),12(0)],
  //     withdrawn:[1(0),12(1),25(1)]
  //   }

  it("Attempt to close Non-active candidates before a withdraw window given all candidates have ZERO receipts.", async () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);

    const candidateBalance = svm.getBalance(newCandidates.winner[1].address);
    const result = closeNonActiveCandidate(
      newCandidates.winner[1].name,
      // Previous test cleared all the receipts in newCandidates.winner[1]
      { hasZeroReceipts: true, while: "before" },
    );
    if (result instanceof FailedTransactionMetadata) {
      assert(false);
    }
    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);

    // vault as destination while closing an account.
    assert.equal(vaultBalanceAfter - vaultBalanceBefore, candidateBalance);
    const winnerCandidate = svm.getAccount(newCandidates.winner[1].address);
    assert.equal(winnerCandidate, null);

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
      assert(false);
    }
  });

  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(1),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(1),25(1)]
  //   }
  function getOpenWithdrawWindowInstruction(instructionArgs: {
    nonActiveCandidateName: string;
    until: anchor.BN;
  }) {
    const { nonActiveCandidateName: _name, until } = instructionArgs;
    const data = coder.instruction.encode("open_claim_back_window", {
      _name,
      until,
    });
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
          pubkey: getCandidatePda(_name).address,
          isSigner: false,
          isWritable: true,
        },
      ],
      data,
    });
  }
  function openWithdrawWindowForNonActiveCandidate(
    nonActiveCandidateName: string,
    until: anchor.BN,
  ) {
    const ix = getOpenWithdrawWindowInstruction({
      nonActiveCandidateName,
      until,
    });
    const result = sendTransaction([ix], [admin]);
    return result;
  }
  it("Open a withdraw window for non active canidates ", () => {
    const now = svm.getClock();
    let until = new anchor.BN(now.unixTimestamp).add(new anchor.BN(14 * 86400));
    const failed = openWithdrawWindowForNonActiveCandidate(
      newCandidates.winner[0].name,
      until,
    );
    assertTxFailedWithErrorCode(
      failed,
      "CanBeClosedImmediatelyWithoutWithdrawWindow",
      // For a winner candidate, there is no such thing like opening a withdraw window.
      // The above error code is due to the receipt having 0 receipts otherwise it would throw "CanBeClosedImmediatelyByClearingReceipts"
    );

    const metadata = openWithdrawWindowForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      until,
    );

    if (metadata instanceof FailedTransactionMetadata) {
      assert(false);
    }

    const metadata2 = openWithdrawWindowForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      until,
    );
    if (metadata2 instanceof FailedTransactionMetadata) {
      assert(false);
    }
  });

  it("Attempts to clear receipts during a withdraw window for Non active candidates except winner having NON-ZERO receipts", async () => {
    // Must fail during a withdraw window.
    const failed = clearReceiptForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { while: "during", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed, "WaitUntilWithdrawWindowIsClosed");

    const failed2 = clearReceiptForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      { while: "during", hasZeroReceipts: false },
    );
    assertTxFailedWithErrorCode(failed2, "WaitUntilWithdrawWindowIsClosed");
  });
  // NO CHANGE
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(1),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(1),25(1)]
  //   }
  it("Attempt to close Non active candidates during a withdraw window given all candidates has Non zero receipts.", async () => {
    const failed = closeNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      { hasZeroReceipts: false, while: "during" },
    );
    assertTxFailedWithErrorCode(failed, "WaitUntilWithdrawWindowIsClosed");

    const failed2 = closeNonActiveCandidate(newCandidates.withdrawn[1].name, {
      hasZeroReceipts: false,
      while: "during",
    });
    assertTxFailedWithErrorCode(failed2, "WaitUntilWithdrawWindowIsClosed");
  });
  // NO CHANGE
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(1),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(1),25(1)]
  //   }
  it("Attempt to claim tokens for a non active candidate during a withdraw window given each non active candidate have NON-ZERO receipts.", async () => {
    const tokenAccountBefore = getHxuiAccount(users[0].publicKey);
    const [userReceipt, userReceiptInfo] = getVoteReceipt(
      newCandidates.claimableWinner[1].name,
      users[0].publicKey,
    );
    const candidateStateBefore = getCandidateAccount(
      newCandidates.claimableWinner[1].name,
    );
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    claimTokensForNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      users[0],
      { hasZeroReceipts: false, while: "during" },
    );
    const candidateStateAfter = getCandidateAccount(
      newCandidates.claimableWinner[1].name,
    );

    assert(
      candidateStateBefore.receipt_count
        .sub(candidateStateAfter.receipt_count)
        .eq(new anchor.BN(1)),
    );
    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    // user got 50% of the tokens spent for claimable winner.

    const tokenAccountAfter = getHxuiAccount(users[0].publicKey);
    assert(
      new anchor.BN(tokenAccountAfter.amount - tokenAccountBefore.amount).eq(
        userReceipt.tokens.div(new anchor.BN(2)),
      ),
    );
    const userReceiptAccountInfoAfter = svm.getAccount(
      getVoteReceiptPda(
        newCandidates.claimableWinner[1].name,
        users[0].publicKey,
      ).address,
    );
    assert.equal(userReceiptAccountInfoAfter, null);
    assert.equal(
      vaultBalanceAfter - vaultBalanceBefore,
      userReceiptInfo.lamports,
    );

    claimTokensForNonActiveCandidate(
      newCandidates.withdrawn[1].name,
      users[0],
      { hasZeroReceipts: false, while: "during" },
    );

    const tokenAccountFinally = getHxuiAccount(users[0].publicKey);

    // user got 100% of the tokens spent for withdrawn candidate.
    assert(
      new anchor.BN(tokenAccountFinally.amount - tokenAccountAfter.amount).eq(
        userReceipt.tokens,
      ),
    );
  });
  // newCandidates.claimableWinner[1] AND newCandidates.withdrawn[1] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0),25(1)]
  //   }
  it("Attempt to close a Non active candidate during a withdraw window given each non active candidate has exactly 0 receipts", async () => {
    const result = closeNonActiveCandidate(
      newCandidates.claimableWinner[1].name,
      {
        hasZeroReceipts: true,
        while: "during",
      },
    );
    const result2 = closeNonActiveCandidate(newCandidates.withdrawn[1].name, {
      hasZeroReceipts: true,
      while: "during",
    });

    if (
      result instanceof FailedTransactionMetadata ||
      result2 instanceof FailedTransactionMetadata
    ) {
      assert(false);
    }
  });
  // newCandidates.claimableWinner[1] AND newCandidates.withdrawn[1] RECEIPTS ARE CLEARED AND CLOSED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(1)]
  //   }
  it("Open and close withdraw window for non withdrawn and claimable winner candidate.", async () => {
    const now = svm.getClock();
    const until = now.unixTimestamp + BigInt(14 * 86400);
    // 14 days

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
      assert(false);
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

  it("Attempt to claim tokens for a non active candidate after the withdraw window where each candidate has NON ZERO receipts.", async () => {
    const failed = claimTokensForNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      users[0],
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed, "UnclaimableNow");

    const failed2 = claimTokensForNonActiveCandidate(
      newCandidates.withdrawn[2].name,
      users[0],
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed2, "UnclaimableNow");
  });
  // NO CHANGE
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(1)]
  //   }
  it("Attempt to close a Non active candidate after a withdraw window given each non active candidate have NON ZERO receipts.", async () => {
    // Non zero receipts
    // CloseAllReceiptAccount
    const failed = closeNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed, "CloseAllReceiptAccount");

    const failed2 = closeNonActiveCandidate(
      newCandidates.claimableWinner[2].name,
      { hasZeroReceipts: false, while: "after" },
    );
    assertTxFailedWithErrorCode(failed2, "CloseAllReceiptAccount");
  });
  // NO CHANGE
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(1)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(1)]
  //   }
  it("Attempt to clear receipts for a non active candidate after a withdraw window where each non active candidate have non zero receipts", async () => {
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
      assert(false);
    }
  });

  // newCandidates.claimableWinner[2] and newCandidates.withdrawn[2] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(0)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(0)]
  //   }
  it("Attempt to close Non-active candidates after a withdraw window given all candidates have ZERO receipts.", async () => {
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
      assert(false);
    }
  });

  // newCandidates.claimableWinner[2] and newCandidates.withdrawn[2] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[10(0,closed),12(0,closed),24(0,closed)],
  //     winner:[10(0),12(0,closed)],
  //     withdrawn:[1(0,closed),12(0,closed),25(0,closed)]
  //   }

  it(
    "Attempt to draw winner when no active candidates have more than or equal to 10 votes.",
  );
});

describe("6)Withdrawl and financing the vote receipts.", () => {
  /*Vault pays the rent for all the new vote receipts created. So, the minimum balance for hxuiVault = enough lamports to exempt its own rent + enough lamports to exempt every new vote receipt account possibly created Math.floor(hxuiMint.supply/tokensPerVote). This assumes that every new vote requires a new receipt and the price paid by user per vote in lamports is > than the rent of each vote receipt.
     So user buys voting
     tokens -> sends the lamports to the vault -> vault pays the rent upon vote. Need not pay rent for creating a vote receipt, Better UX. The money is made when the
      receipt is closed in various scenarios. I think I should have a "rob_the_vault" instruction that just empties the vault...Because if
       there exists a non active user who is never gonna vote but hols 4 voting tokens, then the lamports equivalent to the rent of 2 vote
        receipt accounts will be stuck in the vault forever or should I keep the admin as permanent delegate of hxuiMint token and
    use interest bearing extension to track the last mint time (if its possible). I can run a 'crank' script that burns tokens
    in token accounts for non active users after a threshold time and let me withdraw more lamports from the vault.Sounds stupid. requires brain storming. Interest bearing token is a pure cosmetic extension i think.
    */

  function getMinimumVaultBalance() {
    const hxuiMint = getHxuiMint();
    const hxuiConfig = getConfigAccount();
    return (
      svm.minimumBalanceForRentExemption(BigInt(0)) +
      BigInt(Math.floor(Number(hxuiMint.supply) / hxuiConfig.tokens_per_vote)) *
        svm.minimumBalanceForRentExemption(BigInt(21))
    );
  }
  it("Attempt withdrawl from non-admin", () => {
    const ix = getSafeWithdrawlFromVaultInstruction();
    try {
      sendTransaction([ix], []);
      assert(false);
    } catch (_) {
      assert(true);
    }
  });
  it("Withdraw amount less than possible from the vault", () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const minimumVaultBalance = getMinimumVaultBalance();
    const maximumWithdrawAmount = vaultBalanceBefore - minimumVaultBalance;
    const withdrawAmount = new anchor.BN(maximumWithdrawAmount).divRound(
      new anchor.BN(2),
    );
    const ix = getSafeWithdrawlFromVaultInstruction({
      amount: withdrawAmount,
    });
    const adminBalanceBefore = svm.getBalance(adminPubkey);
    sendTransaction([ix], [admin]);

    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert(
      new anchor.BN(vaultBalanceBefore - vaultBalanceAfter).eq(withdrawAmount),
    );
    const adminBalanceAfter = svm.getBalance(adminPubkey);
    assert.equal(adminBalanceAfter - adminBalanceBefore, withdrawAmount);
  });
  it("Attempt to withdraw amount greater than the vault can afford, must FAIL", () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const minimumVaultBalance = getMinimumVaultBalance();
    const maximumWithdrawAmount = vaultBalanceBefore - minimumVaultBalance;
    const withdrawAmount = new anchor.BN(minimumVaultBalance)
      .divRound(new anchor.BN(2))
      .add(new anchor.BN(maximumWithdrawAmount));
    const ix = getSafeWithdrawlFromVaultInstruction({
      amount: withdrawAmount,
    });
    const failed = sendTransaction([ix], [admin]);
    assertTxFailedWithErrorCode(failed, "InsufficientFunds");
  });
  it("Withdraw maximum amount possible from the vault WITHOUT explicitly passing the amount.", () => {
    const vaultBalanceBefore = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    const minimumVaultBalance = getMinimumVaultBalance();
    const maximumWithdrawAmount = vaultBalanceBefore - minimumVaultBalance;
    const ix = getSafeWithdrawlFromVaultInstruction();
    const adminBalanceBefore = svm.getBalance(adminPubkey);
    sendTransaction([ix], [admin]);

    const vaultBalanceAfter = svm.getBalance(getPda(SEEDS.hxuiVault).address);
    assert.equal(vaultBalanceAfter, minimumVaultBalance);
    const adminBalanceAfter = svm.getBalance(adminPubkey);
    assert.equal(adminBalanceAfter - adminBalanceBefore, maximumWithdrawAmount);
  });
});

describe("Updating config", () => {
  it("1) updating price per token.", () => {
    const newPricePerToken = price_per_token.mul(new anchor.BN(2)); // new price is twice times of const price_per_token

    const updateConfigIx = getUpdateConfigInstruction(
      {},
      { newPricePerToken }, // newTokensPerVote's default value is null
    );

    const configBefore = getConfigAccount();
    assert(configBefore.price_per_token.eq(price_per_token));

    const metadata = sendTransaction([updateConfigIx], [admin]);
    assert(metadata instanceof TransactionMetadata);
    const configAfter = getConfigAccount();
    assert(configAfter.price_per_token.eq(newPricePerToken));
    assert(configAfter.admin.equals(admin.publicKey)); // no change in the admin
  });
  it("2) Updating the admin along with the price per token", () => {
    const newAdmin = new Keypair();
    const newPricePerToken = price_per_token.mul(new anchor.BN(4)); // new price is four times of const price_per_token

    const updateConfigIx = getUpdateConfigInstruction(
      { newAdmin },
      { newPricePerToken },
    );

    const configBefore = getConfigAccount();
    assert(
      configBefore.price_per_token.eq(price_per_token.mul(new anchor.BN(2))), // last it updated the price_per_token to this.
    );

    const metadata = sendTransaction([updateConfigIx], [admin, newAdmin]);
    assert(metadata instanceof TransactionMetadata);

    const configAfter = getConfigAccount();
    assert(configAfter.price_per_token.eq(newPricePerToken));
    assert(configAfter.admin.equals(newAdmin.publicKey));
  });
  it("Delegate admin access for testing by the foundation team", () => {
    const newAdmin = new Keypair();
    const data = coder.instruction.encode("get_admin_access_for_testing", {});
    const getAdminAccessForTestingIx = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: newAdmin.publicKey, isSigner: true, isWritable: false },
        {
          pubkey: getPda(SEEDS.hxuiConfig).address,
          isSigner: false,
          isWritable: true,
        },
      ],
      data,
    });

    const metadata = sendTransaction([getAdminAccessForTestingIx], [newAdmin], {
      logIfFailed: true,
    });
    assert(metadata instanceof TransactionMetadata);

    const configAfter = getConfigAccount();
    assert(configAfter.admin.equals(newAdmin.publicKey));
  });
});

//instructions
function getSafeWithdrawlFromVaultInstruction(
  instructionArgs: {
    amount: null | undefined | anchor.BN;
  } = { amount: null },
) {
  const { amount } = instructionArgs;
  const data = coder.instruction.encode("withdraw_vault_funds", { amount });
  return new TransactionInstruction({
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

function getCreatePollInstruction(instructionArgs: {
  pollDeadline: anchor.BN;
}) {
  const { pollDeadline: new_drop_time } = instructionArgs;
  const data = coder.instruction.encode("set_drop_time", {
    new_drop_time,
  });
  return new TransactionInstruction({
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
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getDrawWinnerInstruction(candidatesMeta: anchor.web3.AccountMeta[]) {
  const data = coder.instruction.encode("draw_winner", {});
  return new TransactionInstruction({
    programId,
    keys: [
      // { pubkey: adminPubkey, isSigner: true, isWritable: false },
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
      ...candidatesMeta,
    ],
    data,
  });
}
function getWithdrawCandidateInstruction(instructionArgs: {
  candidateName: string;
}) {
  const { candidateName: _name } = instructionArgs;
  const data = coder.instruction.encode("withdraw_candidate", { _name });
  const candidateAddress = getCandidatePda(_name).address;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      { pubkey: candidateAddress, isSigner: false, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiPoll).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}
function getCloseCandidateInstruction(instructionArgs: {
  candidateName: string;
}) {
  const { candidateName: _name } = instructionArgs;
  const data = coder.instruction.encode("close_candidate", { _name });

  const candidateAddress = getCandidatePda(_name).address;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: adminPubkey, isSigner: true, isWritable: false },
      { pubkey: candidateAddress, isSigner: false, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiVault).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}

function getUpdateConfigInstruction(
  accounts: { newAdmin?: Keypair } = {},
  instructionArgs: {
    newPricePerToken?: anchor.BN;
    newTokensPerVote?: anchor.BN;
  } = {},
) {
  const { newAdmin: { publicKey: new_admin_pubkey = null } = {} } = accounts;
  const {
    newPricePerToken: price_per_token = null,
    newTokensPerVote: tokens_per_vote = null,
  } = instructionArgs;

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
function getVoteCandidateInstruction(
  context: { owner: PublicKey },
  instructionArgs: {
    candidateName: string;
    votes: anchor.BN;
  },
) {
  const { owner } = context;
  const { candidateName: name, votes } = instructionArgs;

  const candidateAddress = getCandidatePda(name).address;
  const data = coder.instruction.encode("vote_with_hxui", {
    name,
    votes,
  });

  const tokenAddress = getHxuiTokenAddress(owner);
  const [voteReceiptAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote_receipt"), Buffer.from(name), owner.toBuffer()],
    programId,
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: tokenAddress, isSigner: false, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiMint).address,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: candidateAddress,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: voteReceiptAddress,
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
      {
        pubkey: TOKEN_2022_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
}

function getRegisterForFreeTokensInstruction(accounts: { for: PublicKey }) {
  const data = coder.instruction.encode("register_for_free_tokens", {});
  const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("free_mint_tracker"), accounts.for.toBuffer()],
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
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function getClaimRegistrationFeesInstruction(accounts: { for: PublicKey }) {
  const data = coder.instruction.encode("claim_registration_deposit", {});
  const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("free_mint_tracker"), accounts.for.toBuffer()],
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
  const data = coder.instruction.encode("deregister_from_free_mint", {});
  const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("free_mint_tracker"), accounts.for.toBuffer()],
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
    [Buffer.from("free_mint_tracker"), accounts.to.toBuffer()],
    programId,
  );

  const data = coder.instruction.encode("mint_free_tokens", {});

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.to, isSigner: false, isWritable: false },
      { pubkey: liteAuthority.publicKey, isSigner: true, isWritable: false },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },

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

function getBuyPaidTokensInstruction(
  accounts: { owner: PublicKey },
  instructionArgs: { amount: anchor.BN },
) {
  const hxuiMintAddress = getPda(SEEDS.hxuiMint).address;

  const tokenAta = getAssociatedTokenAddressSync(
    hxuiMintAddress,
    accounts.owner,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const data = coder.instruction.encode("buy_tokens", instructionArgs);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      { pubkey: tokenAta, isSigner: false, isWritable: true },
      { pubkey: hxuiMintAddress, isSigner: false, isWritable: true },
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

function getClaimbackOfferInstruction(instructionArgs: {
  candidateName: string;
}) {
  const { candidateName: _name } = instructionArgs;
  const data = coder.instruction.encode("enable_claim_back_offer", {
    _name,
  });
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
        pubkey: getCandidatePda(_name).address,
        isSigner: false,
        isWritable: true,
      },
    ],
    data,
  });
}
function getCreateCandidateInstruction(
  accounts: { admin: PublicKey },
  instructionArgs: {
    name: string;
    description: string;
    enable_claim_back_offer: boolean;
  },
) {
  const data = coder.instruction.encode("create_candidate", instructionArgs);
  const candidateAddress = getCandidatePda(instructionArgs.name).address;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.admin, isSigner: true, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiConfig).address,
        isSigner: false,
        isWritable: false,
      },

      { pubkey: candidateAddress, isSigner: false, isWritable: true },
      {
        pubkey: getPda(SEEDS.hxuiPoll).address,
        isSigner: false,
        isWritable: true,
      },

      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}
//accounts
function getVoteReceipt(candidateName: string, owner: PublicKey) {
  const [receiptAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote_receipt"), Buffer.from(candidateName), owner.toBuffer()],
    programId,
  );
  const receiptInfo = svm.getAccount(receiptAddress);
  const receiptData = coder.accounts.decode(
    "VoteReceipt",
    Buffer.from(receiptInfo.data),
  );
  return [receiptData, receiptInfo] as const;
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

function getHxuiAccount(owner: PublicKey) {
  const tokenAddress = getHxuiTokenAddress(owner);
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
    "HxuiFreeMintCounter",
    Buffer.from(accountInfo.data),
  );
  return accountData;
}

function assertTxFailedWithErrorCode(
  failed: FailedTransactionMetadata | TransactionMetadata,
  errorCode: string,
  printLogs: boolean = false,
) {
  if (failed instanceof TransactionMetadata) {
    assert(false, "Transaction did not fail");
  }
  const logs = failed.meta().logs();
  if (printLogs) {
    console.log(logs);
  }
  for (const log of logs) {
    if (log.search("Error Code: " + errorCode) != -1) {
      assert(true);
      return;
    }
  }
  assert(false, `Transaction failed but not with this ${errorCode} code.`);
}

function getPollAccount() {
  const pollAccountInfo = svm.getAccount(getPda(SEEDS.hxuiPoll).address);
  return coder.accounts.decode(
    "HxuiDropTime",
    Buffer.from(pollAccountInfo.data),
  );
}
function getConfigAccount() {
  const configAccountInfo = svm.getAccount(getPda(SEEDS.hxuiConfig).address);
  return coder.accounts.decode(
    "HxuiConfig",
    Buffer.from(configAccountInfo.data),
  );
}

function getCandidatePda(name: string) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_candidate"), Buffer.from(name)],
    programId,
  );
  return { address, bump } as const;
}
function getCandidateAccount(name: string) {
  const candidateAddress = getCandidatePda(name).address;
  const candidateAccountInfo = svm.getAccount(candidateAddress);
  return coder.accounts.decode(
    "HxuiCandidate",
    Buffer.from(candidateAccountInfo.data),
  );
}

function getVoteCandidateWithHxuiLiteInstruction(
  accounts: Record<"owner", PublicKey>,
  instructionArgs: { _name: string; votes: anchor.BN },
) {
  const data = coder.instruction.encode("vote_with_hxui_lite", instructionArgs);

  const tokenAddress = getHxuiLiteTokenAddress(accounts.owner);
  const mintAddress = getPda(SEEDS.hxuiLiteMint).address;
  const candidateAddress = getCandidatePda(instructionArgs._name).address;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.owner, isSigner: true, isWritable: false },
      { pubkey: tokenAddress, isSigner: false, isWritable: true },
      { pubkey: mintAddress, isSigner: false, isWritable: true },
      { pubkey: candidateAddress, isSigner: false, isWritable: true },
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

function getVoteReceiptPda(candidateName: string, owner: PublicKey) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vote_receipt"), Buffer.from(candidateName), owner.toBuffer()],
    programId,
  );
  return { address, bump };
}
