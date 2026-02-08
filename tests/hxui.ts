import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hxui } from "../target/types/hxui";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAccountLen,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "assert";
const { BN } = anchor;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.hxui as Program<Hxui>;

const { connection } = provider;
const { payer } = provider.wallet;

const getBlockTime = async () => {
  const slot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(slot);
  if (blockTime === null) {
    throw new Error("Failed to fetch the block time");
  }
  return blockTime;
};

const sleep = async (seconds: number) =>
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const airdrop = async (
  ...args: Parameters<typeof connection.requestAirdrop>
) => {
  const signature = await connection.requestAirdrop(...args);
  await connection.confirmTransaction(signature, "confirmed");
};
const [hxuiLiteMintAddress] = PublicKey.findProgramAddressSync(
  [Buffer.from("hxui_lite_mint")],
  program.programId,
);

const admin = new Keypair();

const adminPubkey = admin.publicKey;
const liteAuthority = new Keypair();

const [hxuiMintAddress] = PublicKey.findProgramAddressSync(
  [Buffer.from("hxui_mint")],
  program.programId,
);

const [hxuiVaultAddress] = PublicKey.findProgramAddressSync(
  [Buffer.from("hxui_vault")],
  program.programId,
);
const [hxuiConfigAddress, hxuiConfigBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("hxui_config")],
  program.programId,
);

const [hxuiFreeTokensCounterAddress, hxuiFreeTokensCounterBump] =
  PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_free_tokens_counter")],
    program.programId,
  );

const pricePerToken = new BN(0.001 * LAMPORTS_PER_SOL);
const tokensPerVote = new BN(2);

const createCandidate = async (
  name: string,
  description: string,
  claimableIfWinner: boolean = true,
  claimableBps: null | undefined | number = null,
) => {
  const fundAdminIxn = await program.methods
    .fundAdminForCandidate()
    .accounts({ admin })
    .instruction();
  const createAndIntialiseIxn = await program.methods
    .createCandidate(name, description, claimableIfWinner, claimableBps)
    .accounts({
      admin,
    })
    .instruction();
  const transactionMessage = new Transaction().add(
    fundAdminIxn,
    createAndIntialiseIxn,
  );
  await provider.sendAndConfirm(transactionMessage, [payer]);
};

const getRent = async (additionalSpace: number) => {
  return await connection.getMinimumBalanceForRentExemption(additionalSpace);
};

const getPollSize = () => {
  return 8 + 98;
};

const getBalance = async (user: PublicKey) => {
  return await connection.getBalance(user);
};

const MINTED_TIMESTAMP_ACCOUNT_SPACE = 25;
// const cANDIDATE__ACCOUNT_SPACE;

const COOLDOWN = 2;
const FREE_TOKENS_PER_EPOCH = 20;
const CANDIDATE_ACCOUNT_SPACE = 8 + 354;
const FREE_TOKENS_MINT_AMOUNT = 4;
const DEFAULT_CLAIMABLE_BASIS_POINTS = 5000;
let user1 = new Keypair();
let user1Balance = 0;
function getAssociatedTokenAddressOfHxuiLite(user: PublicKey) {
  return getAssociatedTokenAddressSync(
    hxuiLiteMintAddress,
    user,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
}

function getAssociatedTokenAccountForHxuiLiteIxn(
  user: PublicKey,
  ata?: PublicKey,
) {
  if (!ata) {
    ata = getAssociatedTokenAddressOfHxuiLite(user);
  }
  return [
    createAssociatedTokenAccountInstruction(
      user,
      ata,
      user,
      hxuiLiteMintAddress,
      TOKEN_2022_PROGRAM_ID,
    ),
    ata,
  ] as const;
}

async function airdropAndAssert(
  ...args: Parameters<typeof connection.requestAirdrop>
) {
  const [userPubkey, lamports] = args;
  const userBalanceBefore = await getBalance(userPubkey);
  await airdrop(...args);
  const userBalanceAfter = await getBalance(userPubkey);

  assert.equal(userBalanceAfter, userBalanceBefore + lamports);
}
const [pollAddress, pollBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("hxui_poll")],
  program.programId,
);

describe("1) initialise_dapp instruction testing", () => {
  it("1.1) Inits the config account!", async () => {
    await airdrop(adminPubkey, 3 * LAMPORTS_PER_SOL);

    const isClaimable = false;
    const claimBasisPoints = 5000;

    await program.methods
      .initialiseDapp(
        pricePerToken,
        tokensPerVote,
        isClaimable,
        claimBasisPoints,
      )
      .accounts({
        admin: adminPubkey,
        liteAuthority: liteAuthority.publicKey,
      })
      .signers([admin])
      .rpc();

    const hxuiConfigAccount = await program.account.config.fetch(
      hxuiConfigAddress,
    );
    // config check
    assert(hxuiConfigAccount.admin.equals(adminPubkey));
    assert(hxuiConfigAccount.tokensPerVote.eq(tokensPerVote));
    assert(hxuiConfigAccount.pricePerToken.eq(pricePerToken));
    assert.equal(hxuiConfigAccount.bump, hxuiConfigBump);
    assert.equal(hxuiConfigAccount.isClaimBackOfferLive, isClaimable);
    assert.equal(hxuiConfigAccount.claimBasisPoints, claimBasisPoints);
  });
  it("1.2) Init fails for successive invocations!", async () => {
    const pricePerToken = new BN(12000);
    const tokensPerVote = new BN(2);
    const isClaimable = false;
    const claimBasisPoints = 5000;
    //init fails after invoked once.

    await assert.rejects(
      async () =>
        await program.methods
          .initialiseDapp(
            pricePerToken,
            tokensPerVote,
            isClaimable,
            claimBasisPoints,
          )
          .accounts({
            admin: adminPubkey,
            liteAuthority: liteAuthority.publicKey,
          })
          .signers([admin])
          .rpc(),
    );
  });
  it("1.3) HXUI mint test", async () => {
    const [hxuiMintAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("hxui_mint")],
      program.programId,
    );
    const hxuiMint = await connection.getAccountInfo(hxuiMintAddress);

    await sleep(0.2);
    const hxuiMintData = await getMint(
      connection,
      hxuiMintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    // mint is owned by token 2022 program
    assert(hxuiMint.owner.equals(TOKEN_2022_PROGRAM_ID));
    //mint with 0 decimals, admin as hxui vault --> program controlled mint,and no freeze authority
    assert.equal(hxuiMintData.decimals, 0);

    assert(hxuiMintData.mintAuthority.equals(hxuiMintAddress));
    assert(hxuiMintData.freezeAuthority === null);
  });

  it("1.4) HXUI Lite mint test", async () => {
    const hxuiLiteMint = await connection.getAccountInfo(hxuiLiteMintAddress);
    const hxuiLiteMintData = await getMint(
      connection,
      hxuiLiteMintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    // mint is owned by token 2022 program
    assert(hxuiLiteMint.owner.equals(TOKEN_2022_PROGRAM_ID));
    //lite mint, mint authority as system controlled, no freeze authority
    assert.equal(hxuiLiteMintData.decimals, 0);

    const liteMintAuthority = liteAuthority.publicKey;
    assert(hxuiLiteMintData.mintAuthority.equals(liteMintAuthority));
    assert(hxuiLiteMintData.freezeAuthority === null);
  });

  it("1.5) vault funded enough to exempt rent", async () => {
    // Account exists
    const vaultAccount = await connection.getAccountInfo(hxuiVaultAddress);
    assert.notEqual(vaultAccount, null);

    // Account funded with exactly minimum lamports to exempt rent
    const rent = await connection.getMinimumBalanceForRentExemption(0);
    const vaultAccountBalance = await connection.getBalance(hxuiVaultAddress);
    assert.equal(vaultAccountBalance, rent);
  });
});

describe("2) create_poll instruction testing", () => {
  it("2.1) Create Genesis poll", async () => {
    const currentBlockTime = await getBlockTime();
    const pollEndsAt = new BN(currentBlockTime + 3);

    const adminBalanceBefore = await connection.getBalance(adminPubkey);
    await program.methods
      .createPoll(pollEndsAt)
      .accounts({
        admin: adminPubkey,
      })
      .signers([admin])
      .rpc();

    const adminBalanceAfter = await connection.getBalance(adminPubkey);

    const pollRent = await getRent(getPollSize());
    // admin paid for the poll rent.
    assert.equal(adminBalanceAfter, adminBalanceBefore - pollRent);

    const pollAccountData = await program.account.poll.fetch(pollAddress);
    assert.equal(pollAccountData.bump, pollBump);
    assert(pollAccountData.currentPollDeadline.eq(pollEndsAt));
    assert.equal(pollAccountData.currentPollWinnerDrawn, false);
    assert.equal(pollAccountData.totalCandidates, 0);
    assert.equal(pollAccountData.currentPollCandidates.length, 0);
  });
  //   it("2.2) Cannot pick winner before poll ends", async () => {
  //     try {
  //       await program.methods
  //         .drawWinner()
  //         .accounts({ admin: adminPubkey })
  //         .signers([admin])
  //         .rpc();
  //       assert(false);
  //     } catch ({
  //       error: {
  //         errorCode: { code },
  //       },
  //     }) {
  //       //error because the poll is live
  //       assert.equal(code, "PollIsLive");
  //     }
  //   });
  //   it("2.3) Cannot create a new poll before the poll ends", async () => {
  //     const blockTime = await getBlockTime();
  //     const deadline = new BN(blockTime + 3);
  //     try {
  //       await program.methods
  //         .createPoll(deadline)
  //         .accounts({
  //           admin: adminPubkey,
  //         })
  //         .signers([admin])
  //         .rpc();
  //       assert(false);
  //     } catch ({
  //       error: {
  //         errorCode: { code },
  //       },
  //     }) {
  //       assert.equal(code, "PollIsLive");
  //     }
  //   });

  //   it("2.4) Current Poll has ended", async () => {
  //     await sleep(4);
  //     const pollAccount = await program.account.poll.fetch(pollAddress);
  //     const currentBlockTime = await getBlockTime();

  //     assert(pollAccount.currentPollDeadline.toNumber() < currentBlockTime);
  //   });
  //   it("2.5) Cannot create a new poll even after the poll has ended but the winner is not drawn yet (drawable after the ending of poll)", async () => {
  //     const blockTime = await getBlockTime();
  //     const deadline = new BN(blockTime + 120);
  //     //Should fail.
  //     try {
  //       await program.methods
  //         .createPoll(deadline)
  //         .accounts({
  //           admin: adminPubkey,
  //         })
  //         .signers([admin])
  //         .rpc();
  //       assert(false);
  //     } catch ({
  //       error: {
  //         errorCode: { code },
  //       },
  //     }) {
  //       assert.equal(code, "WinnerNotDrawn");
  //     }
  //   });
  //   it("2.6) Winner for current poll is drawn", async () => {
  //     await assert.doesNotReject(
  //       async () =>
  //         await program.methods
  //           .drawWinner()
  //           .accounts({ admin: adminPubkey })
  //           .signers([admin])
  //           .rpc(),
  //     );

  //     const pollAccount = await program.account.poll.fetch(pollAddress);
  //     assert.equal(pollAccount.currentPollWinnerDrawn, true);
  //   });

  //   it("2.7) A new poll can be created but failed due to deadline being smaller than the current time", async () => {
  //     const currentBlockTime = await getBlockTime();
  //     const deadline = new BN(currentBlockTime - 3);
  //     try {
  //       await program.methods
  //         .createPoll(deadline)
  //         .accounts({
  //           admin: adminPubkey,
  //         })
  //         .signers([admin])
  //         .rpc();
  //       assert(false);
  //     } catch ({
  //       error: {
  //         errorCode: { code },
  //       },
  //     }) {
  //       assert.equal(code, "InvalidDeadline");
  //     }
  //   });

  //   it("2.8) A new poll created.", async () => {
  //     const currentBlockTime = await getBlockTime();
  //     const pollEndsAt = new BN(currentBlockTime + 3);
  //     const adminBalanceBefore = await connection.getBalance(adminPubkey);
  //     await assert.doesNotReject(
  //       async () =>
  //         await program.methods
  //           .createPoll(pollEndsAt)
  //           .accounts({
  //             admin: adminPubkey,
  //           })
  //           .signers([admin])
  //           .rpc(),
  //     );

  //     const adminBalanceAfter = await connection.getBalance(adminPubkey);

  //     // the poll is not initialised again.
  //     assert.equal(adminBalanceAfter, adminBalanceBefore);

  //     const pollAccountData = await program.account.poll.fetch(pollAddress);
  //     assert.equal(pollAccountData.bump, pollBump);
  //     assert(pollAccountData.currentPollDeadline.eq(pollEndsAt));
  //     assert.equal(pollAccountData.currentPollWinnerDrawn, false);
  //     assert.equal(pollAccountData.totalCandidates, 0);
  //     assert.equal(pollAccountData.currentPollCandidates.length, 0);
  //   });
});

// describe("4) Registration for minting free tokens.", async () => {
//   const [mintedTimestampAddressForUser1, mintedTimestampBump] =
//     PublicKey.findProgramAddressSync(
//       [Buffer.from("minted_timestamp"), user1.publicKey.toBuffer()],
//       program.programId,
//     );

//   const [user1TokenCreationIxn, user1TokenAddress] =
//     getAssociatedTokenAccountForHxuiLiteIxn(user1.publicKey);

//   it("4.1) Register user 1.", async () => {
//     //associated token account does not exist
//     await airdropAndAssert(user1.publicKey, 2 * LAMPORTS_PER_SOL);
//     assert.equal(await connection.getAccountInfo(user1TokenAddress), null);

//     const user1BalanceBefore = await getBalance(user1.publicKey);
//     await program.methods
//       .registerForFreeTokens()
//       .accounts({
//         owner: user1.publicKey,
//       })
//       .signers([user1])
//       .rpc();

//     const user1BalanceAfter = await getBalance(user1.publicKey);

//     const mintedTimestampAccountBalance = await getBalance(
//       mintedTimestampAddressForUser1,
//     );

//     const mintedTimestampAccountExpectedRent = await getRent(
//       MINTED_TIMESTAMP_ACCOUNT_SPACE,
//     );
//     assert.equal(
//       mintedTimestampAccountBalance,
//       mintedTimestampAccountExpectedRent,
//     );
//     const mintedTimestampAccountData =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForUser1,
//       );

//     //succesfully registered
//     assert.equal(mintedTimestampAccountData.bump, mintedTimestampBump);
//     assert.equal(mintedTimestampAccountData.nextMintableTimestamp, 0);
//     assert.equal(mintedTimestampAccountData.closableTimestamp, 0);
//     assert.equal(
//       user1BalanceAfter,
//       user1BalanceBefore - mintedTimestampAccountBalance,
//     );
//   });

//   it("4.2) Attempt to Mint free tokens without lite mint authority", async () => {
//     try {
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: user1.publicKey,
//           liteAuthority: liteAuthority.publicKey,
//         })
//         .rpc();
//       assert(false);
//     } catch (err) {
//       assert(true);
//     }
//   });
//   it("4.3) Attempt to Mint free token without an associated token account for user 1. FAILS", async () => {
//     try {
//       // must fail
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: user1.publicKey,
//           liteAuthority: liteAuthority.publicKey,
//         })
//         .signers([liteAuthority])
//         .rpc();
//       assert(false);
//     } catch (err) {
//       assert(true);
//     }
//   });
//   it("4.4) Mint free token after creating a token account for user 1. PASSES", async () => {
//     const tx = new Transaction().add(user1TokenCreationIxn);

//     try {
//       await provider.sendAndConfirm(tx, [user1]);
//       assert(true);
//     } catch (err) {
//       assert(false);
//     }

//     const user1TokenAccount = await connection.getAccountInfo(
//       user1TokenAddress,
//     );

//     assert.notEqual(user1TokenAccount, null);

//     await program.methods
//       .mintFreeTokens()
//       .accounts({
//         owner: user1.publicKey,
//         liteAuthority: liteAuthority.publicKey,
//       })
//       .signers([liteAuthority])
//       .rpc();

//     // owner program is token 2022.
//     assert(user1TokenAccount.owner.equals(TOKEN_2022_PROGRAM_ID));

//     await sleep(0.2);
//     const user1TokenAccountData = await getAccount(
//       connection,
//       user1TokenAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     //  User 1 is the owner
//     assert(user1TokenAccountData.owner.equals(user1.publicKey));

//     // the token balance is 0n
//     assert.equal(user1TokenAccountData.amount, BigInt(1));

//     const now = await getBlockTime();

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForUser1,
//       );

//     // the correct mint time (believed current time in solana network) is stored on chain.
//     assert(
//       mintedTimestampAccount.nextMintableTimestamp.eq(new BN(now + COOLDOWN)),
//     );
//   });
//   it("4.5) Attempt to Mint free token to user 1 before cooldown(4 secs) fails.", async () => {
//     //Should fail.
//     try {
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: user1.publicKey,
//           liteAuthority: liteAuthority.publicKey,
//         })
//         .signers([liteAuthority])
//         .rpc();
//       assert(false);
//     } catch ({
//       error: {
//         errorCode: { code },
//       },
//     }) {
//       assert.equal(code, "RateLimitExceeded");
//     }
//   });

//   it("4.6) Attempt to claim back the rent before unregistering", async () => {
//     try {
//       await program.methods
//         .claimRegistrationFees()
//         .accounts({ owner: user1.publicKey })
//         .signers([user1])
//         .rpc();
//       assert(false);
//     } catch ({
//       error: {
//         errorCode: { code },
//       },
//     }) {
//       assert.equal(code, "UnregisterFirst");
//     }
//   });

//   // it("4.5) New token can be minted to user 1 token account (2 secs passed).", async () => {
//   //   await sleep(2);
//   // });

//   it("4.7) Trigger Unregister for user 1 before cooldown of 4 seconds", async () => {
//     await program.methods
//       .unregisterForFreeTokens()
//       .accounts({
//         owner: user1.publicKey,
//       })
//       .signers([user1])
//       .rpc();

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForUser1,
//       );

//     assert(
//       mintedTimestampAccount.closableTimestamp.eq(
//         mintedTimestampAccount.nextMintableTimestamp,
//       ),
//     );
//   });

//   it("4.8) Attempt to mint new tokens after unregistering fails", async () => {
//     try {
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: user1.publicKey,
//           liteAuthority: liteAuthority.publicKey,
//         })
//         .signers([liteAuthority])
//         .rpc();
//       assert(false);
//     } catch ({
//       error: {
//         errorCode: { code },
//       },
//     }) {
//       assert.equal(code, "UnregisteredFreeTokens");
//     }
//   });
//   it("4.9) Attempt to Claim rent after unregistering but before closable time.", async () => {
//     //Closable time in this situation is  last minted time + cooldown.
//     try {
//       await program.methods
//         .claimRegistrationFees()
//         .accounts({ owner: user1.publicKey })
//         .signers([user1])
//         .rpc();
//       assert(false);
//     } catch ({
//       error: {
//         errorCode: { code },
//       },
//     }) {
//       assert.equal(code, "UnclaimableYet");
//     }
//   });

//   it("4.10) Cancel unregister", async () => {
//     await program.methods
//       .cancelUnregisterForFreeTokens()
//       .accounts({ owner: user1.publicKey })
//       .signers([user1])
//       .rpc();
//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForUser1,
//       );
//     assert.equal(mintedTimestampAccount.closableTimestamp, 0);
//   });

//   it("4.11) Mint free tokens to user 1 token account after cooldown", async () => {
//     await sleep(COOLDOWN);

//     const user1TokenAccountDataBefore = await getAccount(
//       connection,
//       user1TokenAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     await program.methods
//       .mintFreeTokens()
//       .accounts({
//         owner: user1.publicKey,
//         liteAuthority: liteAuthority.publicKey,
//       })
//       .signers([liteAuthority])
//       .rpc();

//     await sleep(0.2);
//     const user1TokenAccountDataAfter = await getAccount(
//       connection,
//       user1TokenAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     // the token balance is 0n
//     assert.equal(
//       user1TokenAccountDataAfter.amount - user1TokenAccountDataBefore.amount,
//       BigInt(1),
//     );

//     const now = await getBlockTime();

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForUser1,
//       );

//     // the correct mint time (believed current time in solana network) is stored on chain.
//     assert(
//       mintedTimestampAccount.nextMintableTimestamp.eq(new BN(now + COOLDOWN)),
//     );
//   });

//   it("4.12) Unregister after cooldown allows to claim registration fees immediately", async () => {
//     await sleep(COOLDOWN);
//     const unregistrationIxn = await program.methods
//       .unregisterForFreeTokens()
//       .accounts({ owner: user1.publicKey })
//       .instruction();
//     const claimRegistrationFeesIxn = await program.methods
//       .claimRegistrationFees()
//       .accounts({ owner: user1.publicKey })
//       .instruction();

//     const tx = new Transaction().add(
//       unregistrationIxn,
//       claimRegistrationFeesIxn,
//     );
//     const user1BalanceBefore = await getBalance(user1.publicKey);
//     await provider.sendAndConfirm(tx, [user1]);
//     const user1BalanceAfter = await getBalance(user1.publicKey);

//     const claimedRent = await getRent(MINTED_TIMESTAMP_ACCOUNT_SPACE);
//     assert.equal(user1BalanceAfter, user1BalanceBefore + claimedRent);
//   });
//   it("4.13) Attempt to mint more free tokens than can be minted per epoch", async () => {
//     //register for 2 more users and reregister for user1
//     const freeTokensCounter = await program.account.freeTokensCounter.fetch(
//       hxuiFreeTokensCounterAddress,
//     );
//     const users: Keypair[] = [];
//     const buffer = Math.floor(Math.random() * 3);
//     // attempt to mint for one + buffer more than the remaining tokens.
//     for (let i = 0; i <= freeTokensCounter.remainingFreeTokens + buffer; i++) {
//       const user = new Keypair();
//       users.push(user);
//       await airdropAndAssert(user.publicKey, 0.1 * LAMPORTS_PER_SOL);
//       const registrationIxn = await program.methods
//         .registerForFreeTokens()
//         .accounts({ owner: user.publicKey })
//         .instruction();
//       const [userTokenCreationIxn, userTokenAddress] =
//         getAssociatedTokenAccountForHxuiLiteIxn(user.publicKey);
//       const tx = new Transaction().add(userTokenCreationIxn, registrationIxn);
//       await provider.sendAndConfirm(tx, [user]);
//       try {
//         await program.methods
//           .mintFreeTokens()
//           .accounts({
//             owner: user.publicKey,
//             liteAuthority: liteAuthority.publicKey,
//           })
//           .signers([liteAuthority])
//           .rpc();
//         assert(i < freeTokensCounter.remainingFreeTokens);
//         const {
//           value: { uiAmount: userTokenBalance },
//         } = await connection.getTokenAccountBalance(userTokenAddress);
//         assert.equal(userTokenBalance, 1);
//       } catch ({
//         error: {
//           errorCode: { code },
//         },
//       }) {
//         assert.equal(code, "AllFreeTokensForTheDayMinted");
//         // minting will fail for x+1 user onwards if x are the tokens that can be minted.
//         assert(i >= freeTokensCounter.remainingFreeTokens);
//       }
//     }

//     it("4.14) tokens that can minted for free renews after an epoch");
//   });
// });

describe("5) Candidate Instruction testing", () => {
  const candidate1Name = "Lorem ipsum dolor sit amet, 4321";
  const [candidate1Address, candidate1Bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_candidate"), Buffer.from(candidate1Name)],
    program.programId,
  );
  const candidates: {
    name: string;
    description: string;
    address: PublicKey;
    bump: number;
  }[] = [
    {
      name: candidate1Name,
      description:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in volu.",
      address: candidate1Address,
      bump: candidate1Bump,
    },
  ];

  const users: Keypair[] = [];
  const creationIxns: TransactionInstruction[] = [];
  for (let i = 0; i < 3; i++) {
    const user = new Keypair();
    const [userTokenCreationIxn] = getAssociatedTokenAccountForHxuiLiteIxn(
      user.publicKey,
    );
    creationIxns.push(userTokenCreationIxn);
    users.push(user);
  }

  before(async () => {
    assert(candidates[0].name.length <= 32);
    assert(candidates[0].description.length <= 280);
    for (let i = 0; i < 3; i++) {
      await airdropAndAssert(users[i].publicKey, 0.01 * LAMPORTS_PER_SOL);
    }
    const tx = new Transaction().add(...creationIxns);
    await provider.sendAndConfirm(tx, users);

    await sleep(0.2);
    for (let i = 0; i < 3; i++) {
      const tokenAccount = await getAccount(
        connection,
        getAssociatedTokenAddressOfHxuiLite(users[i].publicKey),
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      assert(tokenAccount.mint.equals(hxuiLiteMintAddress));
      assert(
        tokenAccount.address.equals(
          getAssociatedTokenAddressOfHxuiLite(users[i].publicKey),
        ),
      );
      assert(tokenAccount.owner.equals(users[i].publicKey));
    }

    const newTx = new Transaction();
    for (let i = 0; i < 3; i++) {
      const registerIxn = await program.methods
        .registerForFreeTokens()
        .accounts({
          owner: users[i].publicKey,
        })
        .instruction();
      const mintIxn = await program.methods
        .mintFreeTokens()
        .accounts({
          owner: users[i].publicKey,
          liteAuthority: liteAuthority.publicKey,
        })
        .instruction();
      newTx.add(registerIxn, mintIxn);
    }
    await provider.sendAndConfirm(newTx, [...users, liteAuthority]);
  });

  it("5.1) Create a candidate", async () => {
    const adminBalanceBefore = await getBalance(adminPubkey);
    const pollAccountBefore = await program.account.poll.fetch(pollAddress);
    await program.methods
      .createCandidate(
        candidates[0].name,
        candidates[0].description,
        false,
        null,
      )
      .accounts({ admin: adminPubkey })
      .signers([admin])
      .rpc();
    const adminBalanceAfter = await getBalance(adminPubkey);

    const candidate1AccountBalance = await getBalance(candidates[0].address);
    const expectedCandidate1AccountBalance = await getRent(
      CANDIDATE_ACCOUNT_SPACE,
    );
    assert.equal(candidate1AccountBalance, expectedCandidate1AccountBalance);
    assert.equal(
      adminBalanceBefore - adminBalanceAfter,
      candidate1AccountBalance,
    );
    const candidate1Account = await program.account.candidate.fetch(
      candidates[0].address,
    );

    const pollAccountAfter = await program.account.poll.fetch(pollAddress);

    assert.equal(candidate1Account.name, candidates[0].name);
    assert.equal(candidate1Account.description, candidates[0].description);
    assert.equal(candidate1Account.isWinner, false);
    assert.equal(candidate1Account.canBeWinner, true);
    assert.equal(
      candidate1Account.claimableBasisPointsIfWinner,
      DEFAULT_CLAIMABLE_BASIS_POINTS,
    );
    assert.equal(candidate1Account.claimableIfWinner, false);
    assert.equal(candidate1Account.bump, candidates[0].bump);
    assert.equal(candidate1Account.claimWindow, 0);
    assert.equal(candidate1Account.numberOfVotes, 0);
    assert.equal(candidate1Account.id, pollAccountBefore.totalCandidates);

    // poll account state update.
    assert.equal(
      pollAccountAfter.totalCandidates - pollAccountBefore.totalCandidates,
      1,
    );
    assert.equal(
      pollAccountAfter.currentPollCandidates.length -
        pollAccountBefore.currentPollCandidates.length,
      1,
    );
    assert(
      pollAccountAfter.currentPollCandidates.includes(candidate1Account.id),
    );
  });
  it("5.2) users[0] voting 1 vote to candidates[0] with hxui lite tokens", async () => {
    const votes = 1;
    const candidateAccountBefore = await program.account.candidate.fetch(
      candidates[0].address,
    );
    const tokenAccountStateBefore = await getAccount(
      connection,
      getAssociatedTokenAddressOfHxuiLite(users[0].publicKey),
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    await program.methods
      .voteCandidateWithHxuiLite(candidates[0].name, new BN(votes))
      .accounts({ owner: users[0].publicKey })
      .signers([users[0]])
      .rpc();
    const candidateAccountAfter = await program.account.candidate.fetch(
      candidates[0].address,
    );
    assert(
      candidateAccountAfter.numberOfVotes
        .sub(candidateAccountBefore.numberOfVotes)
        .eq(new BN(votes)),
    );

    await sleep(0.2);
    const tokenAccountStateAfter = await getAccount(
      connection,
      getAssociatedTokenAddressOfHxuiLite(users[0].publicKey),
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const config = await program.account.config.fetch(hxuiConfigAddress);
    assert(
      new BN(tokenAccountStateBefore.amount - tokenAccountStateAfter.amount).eq(
        config.tokensPerVote.mul(new BN(votes)),
      ),
    );
  });
  it("5.3) Creating another candidate", async () => {
    const newCandidateName = "Privy as Solana wallet adapter";
    const newCandidateDescription = candidates[0].description;
    await program.methods
      .createCandidate(newCandidateName, newCandidateDescription, false, null)
      .accounts({ admin: adminPubkey })
      .signers([admin])
      .rpc();
    const [newCandidateAddress, newCandidateBump] =
      PublicKey.findProgramAddressSync(
        [Buffer.from("hxui_candidate"), Buffer.from(newCandidateName)],
        program.programId,
      );
    candidates.push({
      name: newCandidateName,
      description: newCandidateDescription,
      address: newCandidateAddress,
      bump: newCandidateBump,
    });
  });
  it("5.5) Picking a winner after poll has ended", async () => {
    let expectedWinnerCandidateId: number;
    let maxVotes: anchor.BN = new BN(0);
    candidates.forEach(async ({ address }) => {
      const candidate = await program.account.candidate.fetch(address);
      // None of the candidates in the candidates[] are winners so far.
      assert(!candidate.isWinner && candidate.canBeWinner, "a");
      if (
        expectedWinnerCandidateId == undefined ||
        candidate.numberOfVotes.cmp(maxVotes) == 1 ||
        (candidate.numberOfVotes.cmp(maxVotes) == 0 &&
          candidate.id < expectedWinnerCandidateId)
      ) {
        expectedWinnerCandidateId = candidate.id;
        maxVotes = candidate.numberOfVotes;
      }
    });

    await program.methods
      .drawWinner()
      .accounts({
        admin: adminPubkey,
      })
      .remainingAccounts(
        candidates.map(({ address }) => ({
          pubkey: address,
          isWritable: true,
          isSigner: false,
        })),
      )
      .signers([admin])
      .rpc();

    const pollAccount = await program.account.poll.fetch(pollAddress);
    assert.equal(pollAccount.currentPollWinnerDrawn, true, "b");

    candidates.forEach(async ({ address }) => {
      const candidate = await program.account.candidate.fetch(address);
      if (candidate.id == expectedWinnerCandidateId) {
        assert(candidate.isWinner && !candidate.canBeWinner, "c");
      } else {
        assert(!candidate.isWinner && candidate.canBeWinner, "d");
      }
    });
    assert(
      !pollAccount.currentPollCandidates.includes(expectedWinnerCandidateId),
      "e",
    );
  });
  it("5.4) Withdraw a candidate", async () => {
    const candidateBefore = await program.account.candidate.fetch(
      candidates[1].address,
    );
    assert(candidateBefore.canBeWinner && !candidateBefore.isWinner);
    await program.methods
      .withdrawCandidate(candidates[1].name)
      .accounts({
        admin: adminPubkey,
      })
      .signers([admin])
      .rpc();

    const candidateAfter = await program.account.candidate.fetch(
      candidates[1].address,
    );

    assert(!candidateAfter.canBeWinner);

    const pollAccount = await program.account.poll.fetch(pollAddress);
    assert(!pollAccount.currentPollCandidates.includes(candidateAfter.id));
  });

  it("5.5) Cannot vote a Winner or a Withdrawn candidate", async () => {
    try {
      await program.methods
        .voteCandidateWithHxuiLite(candidates[1].name, new BN(1))
        .accounts({
          owner: users[1].publicKey,
        })
        .signers([users[1]])
        .rpc();
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.equal(code, "CandidateIsNoLongerVotable");
    }

    try {
      await program.methods
        .voteCandidateWithHxuiLite(candidates[0].name, new BN(1))
        .accounts({
          owner: users[1].publicKey,
        })
        .signers([users[1]])
        .rpc();
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.equal(code, "CandidateAlreadyAWinner");
    }
  });

  it("5.6) Cannot Withdraw a winner candidate", async () => {
    try {
      // candidates[0] is winner
      await program.methods
        .withdrawCandidate(candidates[0].name)
        .accounts({ admin: adminPubkey })
        .signers([admin])
        .rpc();
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.strictEqual(code, "CandidateAlreadyAWinner");
    }
  });
  it("5.5) Open a withdraw window for candidate for 2 seconds or so", () => {});
  // it("5.6) one of the 3 voters claims it back") it is a free token.
  it("5.6) Attempt to close the account without clearing the receipts after 2 closing of withdraw window", () => {});
  it("5.7) Close the candidate and check the rent.");
});

// describe("5) vote_candidate instruction testing", () => {
//   const name = "Lorem ipsum dolor sit amet, 4321";

//   const [candidateAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("hxui_candidate"), Buffer.from(name)],
//     program.programId,
//   );
//   const [candidateVoterAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("hxui_candidate_component_voters"), Buffer.from(name)],
//     program.programId,
//   );
//   const tokenOwner = new Keypair();
//   const mintTokens = 2;
//   const ownerTokenAccountAddress = getAssociatedTokenAddressSync(
//     hxuiMintAddress,
//     tokenOwner.publicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID,
//   );

//   const candidateAccountSpace = 8 + 331;
//   const candidateVotersAccountSpace = 8 + 5;
//   let predictedExtraReallocationRent: number;
//   before(async () => {
//     const createCandidate = async (
//       name: string,
//       description: string,
//       claimableIfWinner: boolean = true,
//       claimableBps: null | undefined | number = null,
//     ) => {
//       const fundAdminIxn = await program.methods
//         .fundAdminForCandidate()
//         .accounts({ admin })
//         .instruction();
//       const createAndIntialiseIxn = await program.methods
//         .createCandidate(name, description, claimableIfWinner, claimableBps)
//         .accounts({
//           admin,
//         })
//         .instruction();
//       const transactionMessage = new Transaction().add(
//         fundAdminIxn,
//         createAndIntialiseIxn,
//       );
//       await provider.sendAndConfirm(transactionMessage, [payer]);
//     };

//     const description =
//       "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in volu..";
//     assert(name.length <= 32);
//     assert(description.length <= 280);

//     await airdrop(tokenOwner.publicKey, LAMPORTS_PER_SOL);
//     const tokenOwnerBalance = await connection.getBalance(tokenOwner.publicKey);
//     assert.equal(tokenOwnerBalance, LAMPORTS_PER_SOL);

//     await program.methods
//       .buyPaidTokens(new BN(mintTokens))
//       .accounts({
//         owner: tokenOwner.publicKey,
//       })
//       .signers([tokenOwner])
//       .rpc();

//     const {
//       value: { uiAmount: ownerTokenAccountBalance },
//     } = await connection.getTokenAccountBalance(ownerTokenAccountAddress);

//     assert.equal(ownerTokenAccountBalance, mintTokens);
//     const vaultAccountBalanceBefore = await connection.getBalance(
//       hxuiVaultAddress,
//     );
//     const zeroSpaceRent = await connection.getMinimumBalanceForRentExemption(0);
//     assert(vaultAccountBalanceBefore >= zeroSpaceRent);
//     const candidateAccountMinimumBalance =
//       await connection.getMinimumBalanceForRentExemption(candidateAccountSpace);

//     const candidateVotersAccountMinimumBalance =
//       await connection.getMinimumBalanceForRentExemption(
//         candidateVotersAccountSpace,
//       );

//     await sleep(0.25);
//     const hxuiMintDataAfter = await getMint(
//       connection,
//       hxuiMintAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     const hxuiConfigAccount = await program.account.config.fetch(
//       hxuiConfigAddress,
//     );

//     const minimumVaultBalanceToRecordVoters =
//       (await connection.getMinimumBalanceForRentExemption(
//         Math.floor(
//           Number(hxuiMintDataAfter.supply) /
//             hxuiConfigAccount.tokensPerVote.toNumber(),
//         ) * 40,
//       )) - (await connection.getMinimumBalanceForRentExemption(0));
//     predictedExtraReallocationRent = minimumVaultBalanceToRecordVoters;
//     if (
//       vaultAccountBalanceBefore <
//       candidateAccountMinimumBalance +
//         candidateVotersAccountMinimumBalance +
//         minimumVaultBalanceToRecordVoters
//     ) {
//       await airdrop(hxuiVaultAddress, LAMPORTS_PER_SOL);
//       const vaultAccountBalanceAfter = await connection.getBalance(
//         hxuiVaultAddress,
//       );
//       assert(vaultAccountBalanceAfter >= LAMPORTS_PER_SOL);
//     }

//     await createCandidate(name, description);

//     const candidateAccountBalance = await connection.getBalance(
//       candidateAddress,
//     );
//     //candidate account balances equals the minimum rent exemption;
//     assert.equal(candidateAccountBalance, candidateAccountMinimumBalance);

//     const candidateVotersAccountBalance = await connection.getBalance(
//       candidateVoterAddress,
//     );

//     //candidate_voters account balances equals the minimum rent exemption;
//     assert.equal(
//       candidateVotersAccountBalance,
//       candidateVotersAccountMinimumBalance,
//     );
//   });
//   it("5.1) Vote candidate with 1 vote and Record the voter and its votes", async () => {
//     const candidateAccountBefore = await program.account.candidate.fetch(
//       candidateAddress,
//     );

//     const {
//       value: { uiAmount: ownerTokenAccountBalanceBeforeVoting },
//     } = await connection.getTokenAccountBalance(ownerTokenAccountAddress);

//     const tokenOwnerBalanceBefore = await connection.getBalance(
//       tokenOwner.publicKey,
//     );
//     const payerBalanceBefore = await connection.getBalance(payer.publicKey);

//     const candidateVoterAccountBefore = await connection.getAccountInfo(
//       candidateVoterAddress,
//     );

//     const actualCandidateVotersAccountBeforeBalance =
//       candidateVoterAccountBefore.lamports;
//     const votes = Math.floor(mintTokens / 2);
//     await program.methods
//       .voteCandidate(name, new BN(votes))
//       .accounts({
//         owner: tokenOwner.publicKey,
//       })
//       .signers([tokenOwner])
//       .rpc();

//     const payerBalanceAfter = await connection.getBalance(payer.publicKey);
//     const tokenOwnerBalanceAfter = await connection.getBalance(
//       tokenOwner.publicKey,
//     );

//     //exactly 40 bytes worth of lamports moved.
//     assert.equal(
//       tokenOwnerBalanceBefore - tokenOwnerBalanceAfter,
//       predictedExtraReallocationRent,
//     );

//     //network fees paid by anchor wallet.
//     assert.notEqual(payerBalanceAfter, payerBalanceBefore);

//     const candidateVoterAccountAfter = await connection.getAccountInfo(
//       candidateVoterAddress,
//     );

//     const actualCandidateVotersAccountAfterBalance =
//       candidateVoterAccountAfter.lamports;

//     const expectedCandidateVotersAccountAfterBalance =
//       await connection.getMinimumBalanceForRentExemption(
//         candidateVotersAccountSpace + 40,
//       );

//     assert.equal(
//       actualCandidateVotersAccountAfterBalance -
//         actualCandidateVotersAccountBeforeBalance,
//       tokenOwnerBalanceBefore - tokenOwnerBalanceAfter,
//     );

//     // this basically is the test if the supply is distributed in 2 tokens per account and what if all the users vote..then the predictedExtraReallocationRent should be present in the vault along with exempt rent of vault.
//     assert.equal(
//       actualCandidateVotersAccountAfterBalance,
//       predictedExtraReallocationRent +
//         actualCandidateVotersAccountBeforeBalance,
//     );
//     const candidateAccountAfter = await program.account.candidate.fetch(
//       candidateAddress,
//     );
//     assert(
//       candidateAccountAfter.numberOfVotes.eq(
//         candidateAccountBefore.numberOfVotes.add(new BN(votes)),
//       ),
//     );

//     const candidateVotersAccountAfter =
//       await program.account.candidateVoters.fetch(candidateVoterAddress);

//     const ownerInVoterRecord = candidateVotersAccountAfter.voters.find(
//       ({ voter }) => voter.equals(tokenOwner.publicKey),
//     );

//     assert(ownerInVoterRecord.voter.equals(tokenOwner.publicKey));
//     assert(ownerInVoterRecord.votes.eq(new BN(votes)));
//     const {
//       value: { uiAmount: ownerTokenAccountBalanceAfterVoting },
//     } = await connection.getTokenAccountBalance(ownerTokenAccountAddress);

//     assert.equal(
//       ownerTokenAccountBalanceAfterVoting,
//       ownerTokenAccountBalanceBeforeVoting - mintTokens,
//     );
//   });
// });
// describe("5) create_candidate instruction testing", () => {
//   const [hxuiVaultAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("hxui_vault")],
//     program.programId,
//   );

//   const [hxuiMintAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("hxui_mint")],
//     program.programId,
//   );

//   const description =
//     "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in volu..";

//   it("5.1) Create and initialise the candidate and candidate_voters account where vault has just enough balance and supply is hxui_mint = 0.", async () => {
//     const name = "Lorem ipsum dolor sit amet, 1234";
//     const [candidateAddress, candidateBump] = PublicKey.findProgramAddressSync(
//       [Buffer.from("hxui_candidate"), Buffer.from(name)],
//       program.programId,
//     );

//     const [candidateVoterAddress, candidateVoterBump] =
//       PublicKey.findProgramAddressSync(
//         [Buffer.from("hxui_candidate_component_voters"), Buffer.from(name)],
//         program.programId,
//       );

//     // balance = rent minimum
//     const vaultAccountBalance = await connection.getBalance(hxuiVaultAddress);

//     // const zeroSpaceRent = await connection.getMinimumBalanceForRentExemption(0);
//     // assert.equal(vaultAccountBalance, zeroSpaceRent, "Mismatch vault balance.");
//     const candidateAccountMinimumBalance =
//       await connection.getMinimumBalanceForRentExemption(8 + 331);

//     const candidateVotersAccountMinimumBalance =
//       await connection.getMinimumBalanceForRentExemption(8 + 5);

//     const hxuiMintData = await getMint(
//       connection,
//       hxuiMintAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );
//     const [hxuiConfigAddress] = PublicKey.findProgramAddressSync(
//       [Buffer.from("hxui_config")],
//       program.programId,
//     );
//     const hxuiConfigAccount = await program.account.config.fetch(
//       hxuiConfigAddress,
//     );

//     const minimumVaultBalanceToRecordVoters =
//       (await connection.getMinimumBalanceForRentExemption(
//         Math.floor(
//           Number(hxuiMintData.supply) /
//             hxuiConfigAccount.tokensPerVote.toNumber(),
//         ) * 40,
//       )) - (await connection.getMinimumBalanceForRentExemption(0));

//     //funding vault with just enough balance. anything less would cause Insufficient funds error.
//     await airdrop(
//       hxuiVaultAddress,
//       candidateAccountMinimumBalance +
//         candidateVotersAccountMinimumBalance +
//         minimumVaultBalanceToRecordVoters,
//     );
//     const vaultAccountBalanceBeforeCandidateCreation =
//       await connection.getBalance(hxuiVaultAddress);

//     //airdropped lamports equal to creation of a candidate.
//     assert.equal(
//       vaultAccountBalanceBeforeCandidateCreation,
//       vaultAccountBalance +
//         candidateAccountMinimumBalance +
//         candidateVotersAccountMinimumBalance +
//         minimumVaultBalanceToRecordVoters,
//     );

//     const adminBalanceBefore = await connection.getBalance(admin);
//     assert(description.length <= 280);

//     await createCandidate(name, description);

//     const adminBalanceAfter = await connection.getBalance(admin);
//     //admin as mediator, network fee of 5000 lamports bared by the admin.
//     assert.equal(adminBalanceAfter, adminBalanceBefore - 5000);

//     const vaultAccountBalanceAfterCandidateCreation =
//       await connection.getBalance(hxuiVaultAddress);
//     // exempted rent of candidate and candidate_voters.... Now has enough to record voters
//     // in candidate voters.
//     assert.equal(
//       vaultAccountBalanceAfterCandidateCreation,
//       vaultAccountBalance + minimumVaultBalanceToRecordVoters,
//     );

//     const candidateAccountBalance = await connection.getBalance(
//       candidateAddress,
//     );
//     //candidate account balances equals the minimum rent exemption;
//     assert.equal(candidateAccountBalance, candidateAccountMinimumBalance);

//     const candidateVotersAccountBalance = await connection.getBalance(
//       candidateVoterAddress,
//     );

//     //candidate_voters account balances equals the minimum rent exemption;
//     assert.equal(
//       candidateVotersAccountBalance,
//       candidateVotersAccountMinimumBalance,
//     );

//     //verifying the accounts state
//     const candidateAccount = await program.account.candidate.fetch(
//       candidateAddress,
//     );

//     assert.equal(candidateAccount.name, name);
//     assert.equal(candidateAccount.description, description);
//     assert.equal(candidateAccount.isWinner, false);
//     assert.equal(candidateAccount.canBeWinner, true);
//     assert.equal(candidateAccount.claimableBasisPointsIfWinner, 5000),
//       assert.equal(candidateAccount.claimableIfWinner, true);
//     assert.equal(candidateAccount.bump, candidateBump);

//     const candidateVotersAccount = await program.account.candidateVoters.fetch(
//       candidateVoterAddress,
//     );

//     assert.equal(candidateVotersAccount.bump, candidateVoterBump);
//     assert.equal(candidateVotersAccount.voters.length, 0);
//   });

//   // it("5.2) Create and initialise the candidate and candidate_voters account where vault has just enough balance and supply is hxui_mint > 0.", async () => {
//   //   const name = "Lorem ipsum dolor sit amet";
//   //   const [candidateAddress, candidateBump] = PublicKey.findProgramAddressSync(
//   //     [Buffer.from("hxui_candidate"), Buffer.from(name)],
//   //     program.programId,
//   //   );

//   //   const [candidateVoterAddress, candidateVoterBump] =
//   //     PublicKey.findProgramAddressSync(
//   //       [Buffer.from("hxui_candidate_component_voters"), Buffer.from(name)],
//   //       program.programId,
//   //     );

//   //   const hxuiMintDataBeforeMinting = await getMint(
//   //     connection,
//   //     hxuiMintAddress,
//   //     "confirmed",
//   //     TOKEN_2022_PROGRAM_ID,
//   //   );

//   //   const tokenHolders: Keypair[] = [];
//   //   const tokenHoldersLength = 5;
//   //   for (let i = 0; i < tokenHoldersLength; i++) {
//   //     const tokenHolder = new Keypair();
//   //     await airdrop(tokenHolder.publicKey, LAMPORTS_PER_SOL);
//   //     tokenHolders.push(tokenHolder);
//   //     const walletBalance = await connection.getBalance(
//   //       tokenHolders[i].publicKey,
//   //     );
//   //     assert.equal(walletBalance, LAMPORTS_PER_SOL);
//   //   }
//   //   const vaultAccountBalanceBeforeTokenPurcase = await connection.getBalance(
//   //     hxuiVaultAddress,
//   //   );

//   //   for (let i = 0; i < tokenHoldersLength; i++) {
//   //     await program.methods
//   //       .buyPaidTokens(new BN(2))
//   //       .accounts({
//   //         owner: tokenHolders[i].publicKey,
//   //       })
//   //       .signers([tokenHolders[i]])
//   //       .rpc();

//   //     const associatedTokenAddress = getAssociatedTokenAddressSync(
//   //       hxuiMintAddress,
//   //       tokenHolders[i].publicKey,
//   //       false,
//   //       TOKEN_2022_PROGRAM_ID,
//   //     );
//   //     const {
//   //       value: { uiAmount: tokenAccountBalance },
//   //     } = await connection.getTokenAccountBalance(associatedTokenAddress);
//   //     assert.equal(tokenAccountBalance, 2);
//   //   }

//   //   // balance = rent minimum + tokensLength*2*0.001 * Lamports_per_sol
//   //   const vaultAccountBalanceAfterTokenPurcase = await connection.getBalance(
//   //     hxuiVaultAddress,
//   //   );

//   //   await sleep(0.5); //wait for data to be indexed on-chain...
//   //   const hxuiMintDataAfterMinting = await getMint(
//   //     connection,
//   //     hxuiMintAddress,
//   //     "confirmed",
//   //     TOKEN_2022_PROGRAM_ID,
//   //   );

//   //   assert.equal(
//   //     hxuiMintDataAfterMinting.supply,
//   //     BigInt(tokenHoldersLength * 2) + hxuiMintDataBeforeMinting.supply,
//   //     "Mismatch supply",
//   //   );

//   //   const tokensMinted = Number(
//   //     hxuiMintDataAfterMinting.supply - hxuiMintDataBeforeMinting.supply,
//   //   );
//   //   assert.equal(
//   //     vaultAccountBalanceAfterTokenPurcase,
//   //     vaultAccountBalanceBeforeTokenPurcase +
//   //       tokensMinted * pricePerToken.toNumber(),
//   //   );

//   //   const candidateAccountMinimumBalance =
//   //     await connection.getMinimumBalanceForRentExemption(8 + 331);

//   //   const candidateVotersAccountMinimumBalance =
//   //     await connection.getMinimumBalanceForRentExemption(8 + 5);

//   //   const [hxuiConfigAddress] = PublicKey.findProgramAddressSync(
//   //     [Buffer.from("hxui_config")],
//   //     program.programId,
//   //   );
//   //   const hxuiConfigAccount = await program.account.config.fetch(
//   //     hxuiConfigAddress,
//   //   );

//   //   const minimumVaultBalanceToRecordVoters =
//   //     (await connection.getMinimumBalanceForRentExemption(
//   //       Math.floor(
//   //         Number(hxuiMintDataAfterMinting.supply) /
//   //           hxuiConfigAccount.tokensPerVote.toNumber(),
//   //       ) * 40,
//   //     )) - (await connection.getMinimumBalanceForRentExemption(0));

//   //   const zeroSpaceRent = await connection.getMinimumBalanceForRentExemption(0);

//   //   //funding vault with just enough balance. anything less would cause Insufficient funds error.
//   //   await airdrop(
//   //     hxuiVaultAddress,
//   //     candidateAccountMinimumBalance +
//   //       candidateVotersAccountMinimumBalance +
//   //       minimumVaultBalanceToRecordVoters,
//   //   );
//   //   const vaultAccountBalanceBeforeCandidateCreation =
//   //     await connection.getBalance(hxuiVaultAddress);

//   //   //airdropped lamports equal to creation of a candidate.
//   //   assert.equal(
//   //     vaultAccountBalanceBeforeCandidateCreation,
//   //     vaultAccountBalance +
//   //       candidateAccountMinimumBalance +
//   //       candidateVotersAccountMinimumBalance +
//   //       minimumVaultBalanceToRecordVoters,
//   //   );

//   //   // const adminBalanceBefore = await connection.getBalance(admin);
//   //   // assert(description.length <= 280);

//   //   // await createCandidate(name, description);

//   //   // const adminBalanceAfter = await connection.getBalance(admin);
//   //   // //admin as mediator, network fee of 5000 lamports bared by the admin.
//   //   // assert.equal(adminBalanceAfter, adminBalanceBefore - 5000);

//   //   // const vaultAccountBalanceAfterCandidateCreation =
//   //   //   await connection.getBalance(hxuiVaultAddress);
//   //   // // exempted rent of candidate and candidate_voters.... Now has enough to record voters
//   //   // // in candidate voters.
//   //   // assert.equal(
//   //   //   vaultAccountBalanceAfterCandidateCreation,
//   //   //   vaultAccountBalance + minimumVaultBalanceToRecordVoters,
//   //   // );

//   //   // const candidateAccountBalance = await connection.getBalance(
//   //   //   candidateAddress,
//   //   // );
//   //   // //candidate account balances equals the minimum rent exemption;
//   //   // assert.equal(candidateAccountBalance, candidateAccountMinimumBalance);

//   //   // const candidateVotersAccountBalance = await connection.getBalance(
//   //   //   candidateVoterAddress,
//   //   // );

//   //   // //candidate_voters account balances equals the minimum rent exemption;
//   //   // assert.equal(
//   //   //   candidateVotersAccountBalance,
//   //   //   candidateVotersAccountMinimumBalance,
//   //   // );

//   //   // //verifying the accounts state
//   //   // const candidateAccount = await program.account.candidate.fetch(
//   //   //   candidateAddress,
//   //   // );

//   //   // assert.equal(candidateAccount.name, name);
//   //   // assert.equal(candidateAccount.description, description);
//   //   // assert.equal(candidateAccount.isWinner, false);
//   //   // assert.equal(candidateAccount.isVotable, true);
//   //   // assert.equal(candidateAccount.bump, candidateBump);

//   //   // const candidateVotersAccount = await program.account.candidateVoters.fetch(
//   //   //   candidateVoterAddress,
//   //   // );

//   //   // assert.equal(candidateVotersAccount.bump, candidateVoterBump);
//   //   // assert.equal(candidateVotersAccount.voters.length, 0);
//   // });
// });

// describe("6) safe_withdraw_from_vault instruction testing", () => {
//   let minimumLamportsToExemptRentAndRecordVoters: number;

//   const tokenHolder = new Keypair();
//   const mintTokens = Math.floor(Math.random() * 10 + 4);
//   before(async () => {
//     await airdrop(tokenHolder.publicKey, LAMPORTS_PER_SOL);
//     const tokenHolderBalance = await connection.getBalance(
//       tokenHolder.publicKey,
//     );
//     assert.equal(tokenHolderBalance, LAMPORTS_PER_SOL);

//     const [hxuiMintAddress] = PublicKey.findProgramAddressSync(
//       [Buffer.from("hxui_mint")],
//       program.programId,
//     );
//     //  await sleep(0.5); // this error sucks
//     const hxuiMintDataBefore = await getMint(
//       connection,
//       hxuiMintAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );
//     await program.methods
//       .buyPaidTokens(new BN(mintTokens))
//       .accounts({
//         owner: tokenHolder.publicKey,
//       })
//       .signers([tokenHolder])
//       .rpc();

//     const associatedTokenAddress = getAssociatedTokenAddressSync(
//       hxuiMintAddress,
//       tokenHolder.publicKey,
//       false,
//       TOKEN_2022_PROGRAM_ID,
//     );
//     const {
//       value: { uiAmount: tokenAccountBalance },
//     } = await connection.getTokenAccountBalance(associatedTokenAddress);
//     assert.equal(tokenAccountBalance, mintTokens);

//     const hxuiConfigAccount = await program.account.config.fetch(
//       hxuiConfigAddress,
//     );

//     await sleep(0.5); // this error sucks
//     const hxuiMintDataAfter = await getMint(
//       connection,
//       hxuiMintAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     assert.equal(
//       hxuiMintDataAfter.supply,
//       BigInt(mintTokens) + hxuiMintDataBefore.supply,
//     );
//     //minimum requirement:
//     minimumLamportsToExemptRentAndRecordVoters =
//       await connection.getMinimumBalanceForRentExemption(
//         Math.floor(
//           Number(hxuiMintDataAfter.supply) /
//             hxuiConfigAccount.tokensPerVote.toNumber(),
//         ) * 40,
//       );
//   });
//   beforeEach(async () => {
//     const minimumRequiredVaultBalance =
//       2 * minimumLamportsToExemptRentAndRecordVoters;
//     const vaultBalanceBefore = await connection.getBalance(hxuiVaultAddress);
//     if (vaultBalanceBefore < minimumRequiredVaultBalance) {
//       await airdrop(
//         hxuiVaultAddress,
//         minimumRequiredVaultBalance - vaultBalanceBefore,
//       );

//       sleep(0.25); //Oh goddddd....this works....due to latency in indexing the local ledger
//       const vaultBalanceAfter = await connection.getBalance(hxuiVaultAddress);

//       assert.equal(vaultBalanceAfter, minimumRequiredVaultBalance, "mu");
//     }
//   });

//   it("Attempt withdrawl from non-admin", async () => {
//     const tx = await program.methods
//       .safeWithdrawFromVault(null)
//       .accounts({ admin: tokenHolder.publicKey })
//       .transaction();
//     try {
//       await provider.sendAndConfirm(tx, [tokenHolder]);
//       assert(false);
//     } catch (err) {
//       //     Error is "Only admin can invoke this instruction.",
//       assert(true);
//     }
//   });

//   it("Attempt to withdraw amount greater than the vault can afford, must FAIL", async () => {
//     const vaultBalanceBefore = await connection.getBalance(hxuiVaultAddress);

//     const maximumWithdrawAmount =
//       vaultBalanceBefore - minimumLamportsToExemptRentAndRecordVoters;

//     const withdrawAttempt =
//       maximumWithdrawAmount + 0.5 * minimumLamportsToExemptRentAndRecordVoters;
//     assert(withdrawAttempt <= vaultBalanceBefore);

//     //  the attempt is to withdraw 17.5 sol from a vault of 20 sol even if 5 sol is the minimum balance to be maintained.

//     try {
//       await program.methods
//         .safeWithdrawFromVault(new BN(withdrawAttempt))
//         .accounts({
//           admin,
//         })
//         .rpc();
//       assert(false);
//     } catch ({
//       error: {
//         errorCode: { code },
//       },
//     }) {
//       assert.equal(code, "InsufficientFunds");
//     }
//   });

//   it("Withdraw maximum amount possible from the vault WITH explicitly passing the amount.", async () => {
//     const adminBalanceBefore = await connection.getBalance(admin);
//     const vaultAccountBalanceBefore = await connection.getBalance(
//       hxuiVaultAddress,
//     );

//     const maximumWithdrawAmount =
//       vaultAccountBalanceBefore - minimumLamportsToExemptRentAndRecordVoters;

//     await program.methods
//       .safeWithdrawFromVault(new BN(maximumWithdrawAmount))
//       .accounts({
//         admin,
//       })
//       .rpc();

//     const adminBalanceAfter = await connection.getBalance(admin);
//     const vaultAccountBalanceAfter = await connection.getBalance(
//       hxuiVaultAddress,
//     );

//     assert.equal(
//       vaultAccountBalanceAfter,
//       minimumLamportsToExemptRentAndRecordVoters,
//     );

//     assert.equal(
//       adminBalanceAfter - adminBalanceBefore + 4992, //network fee
//       vaultAccountBalanceBefore - vaultAccountBalanceAfter,
//     );
//   });

//   it("Withdraw amount less than possible from the vault.", async () => {
//     const adminBalanceBefore = await connection.getBalance(admin);
//     const vaultAccountBalanceBefore = await connection.getBalance(
//       hxuiVaultAddress,
//     );

//     const maximumWithdrawAmount =
//       vaultAccountBalanceBefore - minimumLamportsToExemptRentAndRecordVoters;

//     const withdrawAmount = 0.5 * maximumWithdrawAmount;

//     await program.methods
//       .safeWithdrawFromVault(new BN(withdrawAmount))
//       .accounts({
//         admin,
//       })
//       .rpc();

//     const adminBalanceAfter = await connection.getBalance(admin);
//     const vaultAccountBalanceAfter = await connection.getBalance(
//       hxuiVaultAddress,
//     );

//     assert.equal(
//       vaultAccountBalanceAfter,
//       vaultAccountBalanceBefore - withdrawAmount,
//     );

//     assert.equal(
//       adminBalanceAfter - adminBalanceBefore + 5056, //network fee
//       vaultAccountBalanceBefore - vaultAccountBalanceAfter,
//     );
//   });

//   it("Withdraw maximum amount possible from the vault WITHOUT explicitly passing the amount.", async () => {
//     const adminBalanceBefore = await connection.getBalance(admin);
//     const vaultAccountBalanceBefore = await connection.getBalance(
//       hxuiVaultAddress,
//     );
//     const tx = await program.methods
//       .safeWithdrawFromVault(null)
//       .accounts({
//         admin,
//       })
//       .rpc();

//     const adminBalanceAfter = await connection.getBalance(admin);
//     const vaultAccountBalanceAfter = await connection.getBalance(
//       hxuiVaultAddress,
//     );

//     assert.equal(
//       vaultAccountBalanceAfter,
//       minimumLamportsToExemptRentAndRecordVoters,
//     );

//     assert.equal(
//       adminBalanceAfter - adminBalanceBefore + 4992, //network fee
//       vaultAccountBalanceBefore - vaultAccountBalanceAfter,
//     );
//   });

//   // it("Withdraw maximum amount possible from the vault", async () => {
//   //   const tokenBalanceBefore = await connection.getBalance(
//   //     tokenHolder.publicKey,
//   //   );
//   //   const adminBalanceBefore = await connection.getBalance(admin);
//   //   const vaultAccountBalanceBefore = await connection.getBalance(
//   //     hxuiVaultAddress,
//   //   );
//   //   const tx = await program.methods
//   //     .safeWithdrawFromVault(null)
//   //     .accounts({
//   //       payer: payer.publicKey,
//   //       admin: tokenHolder.publicKey,
//   //     })
//   //     .transaction();
//   //   await provider.sendAndConfirm(tx, [payer, tokenHolder]);

//   //   const tokenBalanceAfter = await connection.getBalance(
//   //     tokenHolder.publicKey,
//   //   );
//   //   const adminBalanceAfter = await connection.getBalance(admin);
//   //   const vaultAccountBalanceAfter = await connection.getBalance(
//   //     hxuiVaultAddress,
//   //   );

//   //   assert.equal(
//   //     vaultAccountBalanceAfter,
//   //     minimumLamportsToExemptRentAndRecordVoters,
//   //   );
//   //   assert.equal(adminBalanceAfter + 10000, adminBalanceBefore);

//   //   //
//   //   assert.equal(
//   //     tokenBalanceAfter - tokenBalanceBefore,
//   //     vaultAccountBalanceBefore - vaultAccountBalanceAfter,
//   //   );
//   // });
// });
