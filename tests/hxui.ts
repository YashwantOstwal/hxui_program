import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hxui } from "../target/types/hxui.js";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  unpackMint,
  unpackAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "assert";
import bs58 from "bs58";
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
const CANDIDATE_ACCOUNT_SPACE = 8 + 351;
const FREE_TOKENS_MINT_AMOUNT = 4;
const DEFAULT_CLAIMABLE_BASIS_POINTS = 5000;

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

const pricePerToken = new BN(0.001 * LAMPORTS_PER_SOL);
const tokensPerVote = new BN(2);

describe("1) initialise_dapp instruction testing", () => {
  before(async () => {
    await airdrop(adminPubkey, 4 * LAMPORTS_PER_SOL);
  });
  it("1.1) Inits the config account!", async () => {
    // TODO: admin balance check.
    await program.methods
      .initialiseDapp(pricePerToken, tokensPerVote)
      .accounts({
        admin: adminPubkey,
        liteAuthority: liteAuthority.publicKey,
      })
      .signers([admin])
      .rpc();

    const hxuiConfigAccount =
      await program.account.config.fetch(hxuiConfigAddress);
    // config check
    assert(hxuiConfigAccount.admin.equals(adminPubkey));
    assert(hxuiConfigAccount.tokensPerVote.eq(tokensPerVote));
    assert(hxuiConfigAccount.pricePerToken.eq(pricePerToken));
    assert.equal(hxuiConfigAccount.bump, hxuiConfigBump);
  });
  it("1.2) Init fails for successive invocations", async () => {
    const claimBasisPoints = 5000;
    //init fails after invoked once.

    await assert.rejects(
      async () =>
        await program.methods
          .initialiseDapp(pricePerToken, tokensPerVote)
          .accounts({
            admin: adminPubkey,
            liteAuthority: liteAuthority.publicKey,
          })
          .signers([admin])
          .rpc(),
    );
  });
  it("1.3) Validating HXUI and HXUILite mint", async () => {
    const hxuiMint = await connection.getAccountInfo(hxuiMintAddress);
    assert.notEqual(hxuiMint, null, "HXUI mint does not exist");
    await sleep(0.2);
    const hxuiMintData = await getMint(
      connection,
      hxuiMintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    // mint is owned by token 2022 program
    assert(
      hxuiMint.owner.equals(TOKEN_2022_PROGRAM_ID),
      "HXUI mint is not owned by token-2022 program",
    );
    //mint with 0 decimals, admin as hxui vault --> program controlled mint,and no freeze authority
    assert.equal(hxuiMintData.decimals, 0);

    assert(hxuiMintData.mintAuthority.equals(hxuiMintAddress));
    assert(hxuiMintData.freezeAuthority === null);

    const hxuiLiteMint = await connection.getAccountInfo(hxuiLiteMintAddress);
    const hxuiLiteMintData = unpackMint(
      hxuiLiteMintAddress,
      hxuiLiteMint,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.notEqual(hxuiMint, null, "HXUILite mint does not exist");

    // const hxuiLiteMintData = await getMint(
    //   connection,
    //   hxuiLiteMintAddress,
    //   "confirmed",
    //   TOKEN_2022_PROGRAM_ID,
    // );

    // mint is owned by token 2022 program
    assert(hxuiLiteMint.owner.equals(TOKEN_2022_PROGRAM_ID));
    //lite mint, mint authority as system controlled, no freeze authority
    assert.equal(hxuiLiteMintData.decimals, 0);

    assert(hxuiLiteMintData.mintAuthority.equals(liteAuthority.publicKey));
    assert(hxuiLiteMintData.freezeAuthority === null);
  });

  it("1.5) Vault funded just enough to exempt the rent.", async () => {
    // Account exists
    const vaultAccount = await connection.getAccountInfo(hxuiVaultAddress);
    assert.notEqual(vaultAccount, null);

    // Account funded with exactly minimum lamports to exempt rent
    const rent = await getRent(0);
    const vaultAccountBalance = await getBalance(hxuiVaultAddress);
    assert.equal(vaultAccountBalance, rent);
  });
});

describe("2) Poll creation testing", () => {
  it("2.1) Create Genesis poll", async () => {
    const currentBlockTime = await getBlockTime();
    const pollEndsAt = new BN(currentBlockTime + 3); // deadline is 3secs from now.

    const adminBalanceBefore = await connection.getBalance(adminPubkey);
    await program.methods
      .createPoll(pollEndsAt)
      .accounts({
        admin: adminPubkey,
      })
      .signers([admin])
      .rpc();

    const adminBalanceAfter = await connection.getBalance(adminPubkey);

    const pollRent = await getBalance(pollAddress);
    // admin paid for the poll rent.
    assert.equal(adminBalanceBefore - adminBalanceAfter, pollRent);

    const pollAccountData = await program.account.poll.fetch(pollAddress);
    assert(pollAccountData.currentPollDeadline.eq(pollEndsAt));
    assert.equal(pollAccountData.currentPollWinnerDrawn, false);
    assert.equal(pollAccountData.totalCandidates, 0);
    assert.equal(pollAccountData.currentPollCandidates.length, 0);
    assert.equal(pollAccountData.bump, pollBump);
  });
  it("2.2) Cannot pick winner before poll ends", async () => {
    try {
      await program.methods
        .drawWinner()
        .accounts({ admin: adminPubkey })
        .signers([admin])
        .rpc();
      assert(false);
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.equal(code, "PollIsLive");
    }
  });
  it("2.3) Cannot create a new poll before the poll ends", async () => {
    const blockTime = await getBlockTime();
    const deadline = new BN(blockTime + 3);
    try {
      await program.methods
        .createPoll(deadline)
        .accounts({
          admin: adminPubkey,
        })
        .signers([admin])
        .rpc();
      assert(false);
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.equal(code, "PollIsLive");
    }
  });

  it("2.5) Attempt to create a new poll even after the poll has ended because the winner is not drawn yet. FAILS", async () => {
    await sleep(4);
    const pollAccount = await program.account.poll.fetch(pollAddress);
    const currentBlockTime = await getBlockTime();

    assert(pollAccount.currentPollDeadline.toNumber() < currentBlockTime);

    const blockTime = await getBlockTime();
    const deadline = new BN(blockTime + 120);
    //Should fail.
    try {
      await program.methods
        .createPoll(deadline)
        .accounts({
          admin: adminPubkey,
        })
        .signers([admin])
        .rpc();
      assert(false);
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.equal(code, "WinnerNotDrawn");
    }
  });
  // it("2.6) Winner for current poll is drawn", async () => {
  //   await assert.doesNotReject(
  //     async () =>
  //       await program.methods
  //         .drawWinner()
  //         .accounts({ admin: adminPubkey })
  //         .signers([admin])
  //         .rpc(),
  //   );

  //   const pollAccount = await program.account.poll.fetch(pollAddress);
  //   assert.equal(pollAccount.currentPollWinnerDrawn, true);
  // });

  // it("2.7) A new poll can be created but failed due to deadline being smaller than the current time", async () => {
  //   const currentBlockTime = await getBlockTime();
  //   const deadline = new BN(currentBlockTime - 3);
  //   try {
  //     await program.methods
  //       .createPoll(deadline)
  //       .accounts({
  //         admin: adminPubkey,
  //       })
  //       .signers([admin])
  //       .rpc();
  //     assert(false);
  //   } catch ({
  //     error: {
  //       errorCode: { code },
  //     },
  //   }) {
  //     assert.equal(code, "InvalidDeadline");
  //   }
  // });

  // it("2.8) A new poll created.", async () => {
  //   const currentBlockTime = await getBlockTime();
  //   const pollEndsAt = new BN(currentBlockTime + 3);
  //   const adminBalanceBefore = await connection.getBalance(adminPubkey);
  //   await assert.doesNotReject(
  //     async () =>
  //       await program.methods
  //         .createPoll(pollEndsAt)
  //         .accounts({
  //           admin: adminPubkey,
  //         })
  //         .signers([admin])
  //         .rpc(),
  //   );

  //   const adminBalanceAfter = await connection.getBalance(adminPubkey);

  //   // Poll is not initialised again.
  //   assert.equal(
  //     adminBalanceAfter,
  //     adminBalanceBefore,
  //     "Poll account is recreacted.",
  //   );
  // });
});

// describe("4) Testing 4", async () => {
//   const [mintedTimestampAddressForAdmin, mintedTimestampBump] =
//     PublicKey.findProgramAddressSync(
//       [Buffer.from("minted_timestamp"), admin.publicKey.toBuffer()],
//       program.programId,
//     );

//   const [adminTokenCreationIxn, adminTokenAddress] =
//     getAssociatedTokenAccountForHxuiLiteIxn(admin.publicKey);

//   it("4.1) Registration for minting free HXUILite tokens by adding components for admin..", async () => {
//     //associated token account does not exist
//     const tokenAccount = await connection.getAccountInfo(adminTokenAddress);
//     assert.equal(
//       tokenAccount,
//       null,
//       "HXUILite token account owned by admin exists.",
//     );

//     const adminBalanceBefore = await getBalance(admin.publicKey);
//     await program.methods
//       .registerForFreeTokens()
//       .accounts({
//         owner: admin.publicKey,
//       })
//       .signers([admin])
//       .rpc();

//     const adminBalanceAfter = await getBalance(admin.publicKey);

//     const mintedTimestampAccountBalance = await getBalance(
//       mintedTimestampAddressForAdmin,
//     );

//     // const mintedTimestampAccountExpectedRent = await getRent(
//     //   MINTED_TIMESTAMP_ACCOUNT_SPACE,
//     // );
//     // assert.equal(
//     //   mintedTimestampAccountBalance,
//     //   mintedTimestampAccountExpectedRent,
//     // );

//     assert.equal(
//       mintedTimestampAccountBalance,
//       adminBalanceBefore - adminBalanceAfter,
//     );
//     const mintedTimestampAccountData =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForAdmin,
//       );

//     //
//     assert.equal(mintedTimestampAccountData.nextMintableTimestamp, 0);
//     assert.equal(mintedTimestampAccountData.closableTimestamp, 0);
//     assert.equal(mintedTimestampAccountData.bump, mintedTimestampBump);
//   });

//   it("4.2) Attempt to Mint free tokens without lite mint authority", async () => {
//     try {
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: admin.publicKey,
//           liteAuthority: liteAuthority.publicKey,
//         })
//         .rpc();
//       assert(false);
//     } catch (err) {
//       assert(true);
//     }
//   });
//   it("4.3) Attempt to Mint free token without an associated token account owned by admin. FAILS", async () => {
//     try {
//       // must fail
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: admin.publicKey,
//           liteAuthority: liteAuthority.publicKey,
//         })
//         .signers([liteAuthority])
//         .rpc();
//       assert(false);
//     } catch (err) {
//       assert(true);
//     }
//   });
//   it("4.4) Mint free token after creating an associated token account for admin. PASSES", async () => {
//     const tx = new Transaction().add(adminTokenCreationIxn);

//     try {
//       await provider.sendAndConfirm(tx, [admin]);
//       assert(true);
//     } catch (err) {
//       assert(false);
//     }

//     const adminTokenAccount = await connection.getAccountInfo(
//       adminTokenAddress,
//     );

//     assert.notEqual(adminTokenAccount, null);
//     assert(adminTokenAccount.owner.equals(TOKEN_2022_PROGRAM_ID));

//     await program.methods
//       .mintFreeTokens()
//       .accounts({
//         owner: admin.publicKey,
//         liteAuthority: liteAuthority.publicKey,
//       })
//       .signers([liteAuthority])
//       .rpc();

//     // owner program is token 2022.

//     await sleep(0.2);
//     const adminTokenAccountData = await getAccount(
//       connection,
//       adminTokenAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     //  Admin is the owner
//     assert(adminTokenAccountData.owner.equals(admin.publicKey));

//     // the token balance is 0n
//     assert.equal(adminTokenAccountData.amount, BigInt(FREE_TOKENS_MINT_AMOUNT));

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForAdmin,
//       );

//     const now = await getBlockTime();
//     assert(
//       mintedTimestampAccount.nextMintableTimestamp.eq(new BN(now + COOLDOWN)),
//     );
//   });
//   it("4.5) Attempt to Mint free token to admin before cooldown (4 secs) fails.", async () => {
//     //Should fail.
//     try {
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: admin.publicKey,
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
//         .accounts({ owner: admin.publicKey })
//         .signers([admin])
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

//   it("4.7) Trigger Unregister for admin before cooldown of 4 seconds", async () => {
//     await program.methods
//       .unregisterForFreeTokens()
//       .accounts({
//         owner: admin.publicKey,
//       })
//       .signers([admin])
//       .rpc();

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForAdmin,
//       );

//     assert(
//       mintedTimestampAccount.closableTimestamp.eq(
//         mintedTimestampAccount.nextMintableTimestamp,
//       ),
//       "The closable time is the just after the next mint time.",
//     );
//   });

//   it("4.8) Attempt to mint new tokens after unregistering. FAILS", async () => {
//     try {
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: admin.publicKey,
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
//     //Closable time in this situation is last minted time + cooldown.
//     try {
//       await program.methods
//         .claimRegistrationFees()
//         .accounts({ owner: admin.publicKey })
//         .signers([admin])
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
//       .accounts({ owner: admin.publicKey })
//       .signers([admin])
//       .rpc();
//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForAdmin,
//       );
//     assert.equal(mintedTimestampAccount.closableTimestamp, 0);
//   });

//   it("4.11) Mint free tokens to admin token account after cooldown", async () => {
//     await sleep(COOLDOWN);

//     const adminTokenAccountDataBefore = await getAccount(
//       connection,
//       adminTokenAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     await program.methods
//       .mintFreeTokens()
//       .accounts({
//         owner: admin.publicKey,
//         liteAuthority: liteAuthority.publicKey,
//       })
//       .signers([liteAuthority])
//       .rpc();

//     await sleep(0.2);
//     const adminTokenAccountDataAfter = await getAccount(
//       connection,
//       adminTokenAddress,
//       "confirmed",
//       TOKEN_2022_PROGRAM_ID,
//     );

//     // the token balance is +FREE_TOKENS_MINT_AMOUNT
//     assert.equal(
//       adminTokenAccountDataAfter.amount - adminTokenAccountDataBefore.amount,
//       BigInt(FREE_TOKENS_MINT_AMOUNT),
//     );

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(
//         mintedTimestampAddressForAdmin,
//       );

//     const now = await getBlockTime();
//     assert(
//       mintedTimestampAccount.nextMintableTimestamp.eq(new BN(now + COOLDOWN)),
//     );
//   });

//   it("4.12) Unregister after cooldown allows to claim registration fees immediately", async () => {
//     await sleep(COOLDOWN);
//     const unregistrationIxn = await program.methods
//       .unregisterForFreeTokens()
//       .accounts({ owner: admin.publicKey })
//       .instruction();
//     const claimRegistrationFeesIxn = await program.methods
//       .claimRegistrationFees()
//       .accounts({ owner: admin.publicKey })
//       .instruction();

//     const tx = new Transaction().add(
//       unregistrationIxn,
//       claimRegistrationFeesIxn,
//     );
//     const adminBalanceBefore = await getBalance(admin.publicKey);
//     await provider.sendAndConfirm(tx, [admin]);
//     const adminBalanceAfter = await getBalance(admin.publicKey);

//     const claimedRent = await getRent(MINTED_TIMESTAMP_ACCOUNT_SPACE);
//     assert.equal(adminBalanceAfter, adminBalanceBefore + claimedRent);
//   });
//   it("4.13) Attempt to mint more free tokens than can be minted per epoch", async () => {
//     // Situation when more users attempt to mint free tokens than can be minted.
//     const freeTokensCounter = await program.account.freeTokensCounter.fetch(
//       hxuiFreeTokensCounterAddress,
//     );
//     const users: Keypair[] = [];
//     const buffer = Math.floor(Math.random() * 3);
//     // attempt to mint for one + buffer more than the remaining tokens.
//     for (
//       let i = 0;
//       i <=
//       freeTokensCounter.remainingFreeTokens.toNumber() /
//         FREE_TOKENS_MINT_AMOUNT +
//         buffer;
//       i++
//     ) {
//       const user = new Keypair();
//       users.push(user);
//       await airdropAndAssert(user.publicKey, 0.01 * LAMPORTS_PER_SOL);
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
//         assert(
//           i <
//             freeTokensCounter.remainingFreeTokens.toNumber() /
//               FREE_TOKENS_MINT_AMOUNT,
//         );
//         const {
//           value: { uiAmount: userTokenBalance },
//         } = await connection.getTokenAccountBalance(userTokenAddress);
//         assert.equal(userTokenBalance, FREE_TOKENS_MINT_AMOUNT);
//       } catch ({
//         error: {
//           errorCode: { code },
//         },
//       }) {
//         assert.equal(code, "AllFreeTokensForTheDayMinted");
//         // minting will fail from x+1 user if x are the tokens that can be minted.
//         assert(
//           i >=
//             freeTokensCounter.remainingFreeTokens.toNumber() /
//               FREE_TOKENS_MINT_AMOUNT,
//         );
//       }
//     }

//     it("4.14) tokens that can minted for free renews after an epoch");
//   });
// });

const users: Keypair[] = [];
describe("5) Buying HXUI tokens for users[0]", async () => {
  before(async () => {
    for (let i = 0; i < 3; i++) {
      const user = new Keypair();
      await airdropAndAssert(user.publicKey, LAMPORTS_PER_SOL);
      users.push(user);
    }
  });

  const tokens = 7;
  it("users[0] and users[1] buys 7 HXUI tokens each without an associated token account.", async () => {
    const tokenAddress = getAssociatedTokenAddressSync(
      hxuiMintAddress,
      users[0].publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const tokenAccountInfo = await connection.getAccountInfo(tokenAddress);

    // token account does not exist
    assert.equal(tokenAccountInfo, null);

    const userBalanceBefore = await getBalance(users[0].publicKey);
    await program.methods
      .buyPaidTokens(new BN(tokens))
      .accounts({ owner: users[0].publicKey })
      .signers([users[0]])
      .rpc();
    const userBalanceAfter = await getBalance(users[0].publicKey);

    const tokenAccountInfoAfterPurchase =
      await connection.getAccountInfo(tokenAddress);
    await sleep(2);
    const tokenAccount = unpackAccount(
      tokenAddress,
      tokenAccountInfoAfterPurchase,
      TOKEN_2022_PROGRAM_ID,
    );

    // const tokenAccount = await getAccount(
    //   connection,
    //   tokenAddress,
    //   "confirmed",
    //   TOKEN_2022_PROGRAM_ID,
    // );

    assert.equal(tokenAccount.amount, BigInt(tokens));
    const hxuiConfigAccount =
      await program.account.config.fetch(hxuiConfigAddress);

    const tokenAccountRent = await getBalance(tokenAddress);
    assert(
      hxuiConfigAccount.pricePerToken
        .mul(new BN(tokens))
        .add(new BN(tokenAccountRent))
        .eq(new BN(userBalanceBefore - userBalanceAfter)),
    );

    await program.methods
      .buyPaidTokens(new BN(tokens))
      .accounts({ owner: users[1].publicKey })
      .signers([users[1]])
      .rpc();
  });
  //  users[0] has 7 HXUI tokens
  // x----------------------------x
  it("users[0] buying 7 HXUI tokens with an associated token account.", async () => {
    const user = users[0];

    const tokenAddress = getAssociatedTokenAddressSync(
      hxuiMintAddress,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    const userBalanceBefore = await getBalance(user.publicKey);
    await program.methods
      .buyPaidTokens(new BN(tokens))
      .accounts({ owner: user.publicKey })
      .signers([user])
      .rpc();
    const userBalanceAfter = await getBalance(user.publicKey);

    await sleep(0.2);
    const tokenAccount = await getAccount(
      connection,
      tokenAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(tokenAccount.amount, BigInt(2 * tokens));
    const hxuiConfigAccount =
      await program.account.config.fetch(hxuiConfigAddress);
    assert(
      hxuiConfigAccount.pricePerToken
        .mul(new BN(tokens))
        .eq(new BN(userBalanceBefore - userBalanceAfter)),
    );
  });
});
//  users[0] has 14 HXUI tokens
// x----------------------------x

//
// Vault funding the receipt.
//
// describe("Making the vault pay for vote receipt rent", () => {
//   it("initialising a new account", async () => {
//     const [newAccountAddress] = PublicKey.findProgramAddressSync(
//       [Buffer.from("hxui_new_account")],
//       program.programId,
//     );
//     await airdrop(hxuiVaultAddress, LAMPORTS_PER_SOL * 0.01);
//     const balanceBefore = await getBalance(hxuiVaultAddress);
//     await program.methods.createNewAccount().rpc();

//     const balanceAfter = await getBalance(hxuiVaultAddress);
//     const newAccountBalance = await getBalance(newAccountAddress);

//     assert.equal(balanceBefore - balanceAfter, newAccountBalance);
//   });
// });
//  users[0] has total 8 HXUI tokens
// x----------------------------x

interface Candidate {
  name: string;
  description: string;
  address: PublicKey;
  bump: number;
}
const newCandidates: {
  claimableWinner: Candidate[];
  winner: Candidate[];
  withdrawn: Candidate[];
  active: Candidate[];
} = {
  claimableWinner: [],
  winner: [],
  withdrawn: [],
  active: [],
};
const activeCandidates: Candidate[] = [];
describe("5) Candidate creation, Voting candiate, Picking winner, Active Candidate verioius lifecycles.", () => {
  before(async () => {
    const creationIxns: TransactionInstruction[] = [];
    for (let i = 0; i < users.length; i++) {
      const [userTokenCreationIxn] = getAssociatedTokenAccountForHxuiLiteIxn(
        users[i].publicKey,
      );
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
      creationIxns.push(userTokenCreationIxn, registerIxn, mintIxn);
    }

    const tx = new Transaction().add(...creationIxns);
    await provider.sendAndConfirm(tx, [...users, liteAuthority]);

    await sleep(0.2);
    for (let i = 0; i < users.length; i++) {
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
  });

  // users.length = 3
  // usersHXUITokenBalance = [14,0,0]
  // usersHXUILiteTokenBalance = [4,4,4]

  it("5.1) Creating 8 candidates to test all scenarios.", async () => {
    const candidateName = "Lorem ipsum dolor sit amet, 4321";
    const candidateDescription =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in volu.";

    assert(candidateName.length <= 32);
    assert(candidateDescription.length <= 280);
    const [candidateAddress, candidateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("hxui_candidate"), Buffer.from(candidateName)],
      program.programId,
    );

    const adminBalanceBefore = await getBalance(adminPubkey);
    const pollAccountBefore = await program.account.poll.fetch(pollAddress);
    await program.methods
      .createCandidate(candidateName, candidateDescription, false)
      .accounts({ admin: adminPubkey })
      .signers([admin])
      .rpc();
    const adminBalanceAfter = await getBalance(adminPubkey);

    const candidateAccountBalance = await getBalance(candidateAddress);
    // const expectedcandidateAccountBalance = await getRent(
    //   CANDIDATE_ACCOUNT_SPACE,
    // );
    // assert.equal(candidateAccountBalance, expectedcandidateAccountBalance);
    assert.equal(
      adminBalanceBefore - adminBalanceAfter,
      candidateAccountBalance,
    );
    const candidateAccount =
      await program.account.candidate.fetch(candidateAddress);

    const pollAccountAfter = await program.account.poll.fetch(pollAddress);

    assert.equal(candidateAccount.name, candidateName);
    assert.equal(candidateAccount.description, candidateDescription);
    assert(!!candidateAccount.candidateStatus.active);
    assert.equal(candidateAccount.claimableIfWinner, false);
    assert.equal(candidateAccount.bump, candidateBump);
    assert.equal(candidateAccount.claimWindow, 0);
    assert.equal(candidateAccount.numberOfVotes, 0);
    assert(candidateAccount.totalReceipts.eq(new BN(0)));
    assert.equal(candidateAccount.id, pollAccountBefore.totalCandidates);

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
      pollAccountAfter.currentPollCandidates.includes(candidateAccount.id),
    );

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
      await program.methods
        .createCandidate(name, description, i == 3 || i == 4 || i == 5)
        .accounts({ admin: adminPubkey })
        .signers([admin])
        .rpc();
      const [address, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("hxui_candidate"), Buffer.from(name)],
        program.programId,
      );
      activeCandidates.push({
        name,
        description,
        address,
        bump,
      });
    }

    // verifying activeCandidates[3..5] are claimable while rest are not.
    for (let i = 0; i < activeCandidates.length; i++) {
      const activeCandidateState = await program.account.candidate.fetch(
        activeCandidates[i].address,
      );
      assert(
        !!activeCandidateState.candidateStatus.active,
        "Not an active candidate",
      );
      if (i == 3 || i == 4 || i == 5) {
        assert.equal(
          activeCandidateState.claimableIfWinner,
          true,
          "Not a claimable",
        );
      } else {
        assert.equal(
          activeCandidateState.claimableIfWinner,
          false,
          "is Claimable",
        );
      }
    }
    // users.length = 3
    // usersHXUITokenBalance = [14,0,0]
    // usersHXUILiteTokenBalance = [4,4,4]
    // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  });
  it("5.2) users[0] gives 1 vote to activeCandidates[0] with HXUILite tokens", async () => {
    const votes = 1;
    const candidateAccountBefore = await program.account.candidate.fetch(
      activeCandidates[0].address,
    );
    const tokenAccountStateBefore = await getAccount(
      connection,
      getAssociatedTokenAddressOfHxuiLite(users[0].publicKey),
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    await program.methods
      .voteCandidateWithHxuiLite(activeCandidates[0].name, new BN(votes))
      .accounts({ owner: users[0].publicKey })
      .signers([users[0]])
      .rpc();
    const candidateAccountAfter = await program.account.candidate.fetch(
      activeCandidates[0].address,
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

  // users.length = 3
  // usersHXUITokenBalance = [14,0,0]
  // usersHXUILiteTokenBalance = [2,4,4]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1 (0),0,0,0,0,0,0,0]

  it("5.2) users[0] gives (0,1,2,0,1,2,0,1) votes to 8 candidates with HXUI paid tokens.", async () => {
    const user = users[0];
    const tokenAddress = getAssociatedTokenAddressSync(
      hxuiMintAddress,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    for (let i = 0; i < activeCandidates.length; i++) {
      const votes = i % 3;
      if (votes > 0) {
        const candidateAccount = await program.account.candidate.fetch(
          activeCandidates[i].address,
        );

        const {
          value: { uiAmount: tokensBalanceBefore },
        } = await connection.getTokenAccountBalance(tokenAddress);

        await program.methods
          .voteCandidate(activeCandidates[i].name, new BN(votes))
          .accounts({ owner: user.publicKey })
          .signers([user])
          .rpc();

        const candidateAccountAfter = await program.account.candidate.fetch(
          activeCandidates[i].address,
        );
        assert(
          candidateAccountAfter.numberOfVotes
            .sub(candidateAccount.numberOfVotes)
            .eq(new BN(votes)),
        );

        const {
          value: { uiAmount: tokensBalanceAfter },
        } = await connection.getTokenAccountBalance(tokenAddress);

        const config = await program.account.config.fetch(hxuiConfigAddress);

        const tokensSpent = new BN(tokensBalanceBefore - tokensBalanceAfter);
        assert(tokensSpent.eq(config.tokensPerVote.mul(new BN(votes))), "a");

        const [receiptAddress] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("vote_receipt"),
            Buffer.from(activeCandidates[i].name),
            user.publicKey.toBuffer(),
          ],
          program.programId,
        );
        const voteReceipt =
          await program.account.voteReceipt.fetch(receiptAddress);

        // Verifying the receipt.
        assert.equal(voteReceipt.id, candidateAccount.id);

        // one receipt per voter per candidate. irrespective of votes.
        assert(voteReceipt.tokens.eq(tokensSpent));
      }
    }
  });
  // users.length = 3
  // usersHXUITokenBalance = [0,0,0]
  // usersHXUILiteTokenBalance = [2,4,4]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),1(1),2(1),0(0),1(1),2(1),0(0),1(1)]
  it("Attempt to close an Active candidate with 0 receipts (eg. activeCandidates[0]).", async () => {
    // Only a 0 receipt account can be closed. An active account can never be closed even if the receipts is 0
    const candidate = activeCandidates[0];
    const candidateState = await program.account.candidate.fetch(
      candidate.address,
    );
    assert(candidateState.candidateStatus.active, "Not an active candidate");

    assert.equal(
      candidateState.totalReceipts.isZero(),
      true,
      "Candidate has non-zero receipts",
    );
    try {
      await program.methods
        .closeCandidate(candidate.name)
        .accounts({ admin: adminPubkey })
        .signers([admin])
        .rpc();
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.equal(code, "ActiveCandidateCannotBeClosed");
    }
  });
  // users.length = 3
  // usersHXUITokenBalance = [0,0,0]
  // usersHXUILiteTokenBalance = [2,4,4]
  // activeCandidatesStatus = [active,active,active,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),1(1),2(1),0(0),1(1),2(1),0(0),1(1)]
  it("5.4) Withdraw the first 3 active candidates in activeCandidates.", async () => {
    //Also Verifying the [0..2] unclaimble active candidates with 0,1,2 votes respectively have been withdrawn.
    for (let i = 0; i < 3; i++) {
      const activeCandidate = activeCandidates[i];
      const candidateBefore = await program.account.candidate.fetch(
        activeCandidate.address,
      );
      assert.equal(candidateBefore.claimableIfWinner, false);
      assert(candidateBefore.candidateStatus.active);

      await program.methods
        .withdrawCandidate(activeCandidate.name)
        .accounts({
          admin: adminPubkey,
        })
        .signers([admin])
        .rpc();

      const candidateAfter = await program.account.candidate.fetch(
        activeCandidate.address,
      );

      assert(candidateAfter.candidateStatus.withdrawn);

      const pollAccount = await program.account.poll.fetch(pollAddress);
      assert(!pollAccount.currentPollCandidates.includes(candidateAfter.id));
      newCandidates.withdrawn.push(activeCandidate);
    }

    //No longer active candidates.
    activeCandidates.slice(3);
  });
  // users.length = 3
  // usersHXUITokenBalance = [0,0,0]
  // usersHXUILiteTokenBalance = [2,4,4]
  // activeCandidatesStatus = [withdrawn,withdrawn,withdrawn,active(claimable),active(claimable),active(claimable),active,active]
  // activeCandidateVotesWithReceipts = [1(0),1(1),2(1),0(0),1(1),2(1),0(0),1(1)]
  it("5.5) Picking 5 winners (all the 5 left active candidates) after the end of each poll in 5 polls.", async () => {
    for (let i = 0; i < 5; i++) {
      let expectedWinnerCandidateId: number;
      let maxVotes: anchor.BN = new BN(0);
      let expectedWinnerIndex: number;

      const remainingAccounts: {
        pubkey: PublicKey;
        isSigner: boolean;
        isWritable: boolean;
      }[] = [];
      for (let i = 0; i < activeCandidates.length; i++) {
        const candidateAddress = activeCandidates[i].address;

        const candidate =
          await program.account.candidate.fetch(candidateAddress);
        if (candidate.candidateStatus.active) {
          if (
            expectedWinnerCandidateId == undefined ||
            candidate.numberOfVotes.cmp(maxVotes) == 1 ||
            (candidate.numberOfVotes.cmp(maxVotes) == 0 &&
              candidate.id < expectedWinnerCandidateId)
          ) {
            expectedWinnerCandidateId = candidate.id;
            maxVotes = candidate.numberOfVotes;
            expectedWinnerIndex = i;
          }
          remainingAccounts.push({
            pubkey: candidateAddress,
            isSigner: false,
            isWritable: true,
          });
        }
      }

      await program.methods
        .drawWinner()
        .accounts({
          admin: adminPubkey,
        })
        .remainingAccounts(remainingAccounts)
        .signers([admin])
        .rpc();

      const pollAccount = await program.account.poll.fetch(pollAddress);
      assert.equal(
        pollAccount.currentPollWinnerDrawn,
        true,
        "Poll state is not updated after drawWinner ixn.",
      );

      // verify the winner.
      const winnerCandidate = await program.account.candidate.fetch(
        activeCandidates[expectedWinnerIndex].address,
      );

      // Previously active -> winner or claimable winner.
      if (winnerCandidate.claimableIfWinner) {
        assert(
          !!winnerCandidate.candidateStatus.claimableWinner,
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
        assert(!!winnerCandidate.candidateStatus.winner, "Not a winner");
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
        !pollAccount.currentPollCandidates.includes(expectedWinnerCandidateId),
        "Poll state still considers the winner as competing candidate",
      );
      let i = 0;

      if (i < 5 - 1) {
        const currentBlockTime = await getBlockTime();
        const pollEndsAt = new BN(currentBlockTime + 2);
        await program.methods
          .createPoll(pollEndsAt)
          .accounts({
            admin: adminPubkey,
          })
          .signers([admin])
          .rpc();
        await sleep(3);
        i++;
      }
    }
    //Garbage collected.
    // while (activeCandidates.length === 0) {
    //   activeCandidates.pop();
    // }
  });
});

/* 

users.length = 3
usersHXUITokenBalance = [0,0,0]
usersHXUILiteTokenBalance = [2,4,4]
activeCandidatesStatus = [withdrawn,withdrawn,withdrawn,winner(claimable),winner(claimable),winner(claimable),winner,winner]


activeCandidateVotesWithReceipts = [1(0),1(1),2(1),0(0),1(1),2(1),0(0),1(1)] 

newCandidates = {
    claimableWinner:[0(0),1(1),2(1)],
    winner:[0(0),1(1)],
    withdrawn:[1(0),1(1),2(1)]
  }
newCandidates.claimableWinner[0] means winner with claimable with 0 votes.
newCandidates.withdrawn[2] means withdrawn candidate with 2 votes.
*/

describe("Advance candidate testing", () => {
  it("5.6) Cannot Withdraw a Winner or claimable winner candidate", async () => {
    // Only an active candidate can be withdrawn.
    try {
      await program.methods
        .withdrawCandidate(newCandidates.winner[0].name)
        .accounts({ admin: adminPubkey })
        .signers([admin])
        .rpc();
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.strictEqual(code, "OnlyActiveCandidateCanBeWithdrawn");
    }

    try {
      await program.methods
        .withdrawCandidate(newCandidates.claimableWinner[0].name)
        .accounts({ admin: adminPubkey })
        .signers([admin])
        .rpc();
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.strictEqual(code, "OnlyActiveCandidateCanBeWithdrawn");
    }
  });
  it("5.5) Cannot vote a Non active candidate (eg. Winner (candidates.winner[0]), Claimable Winner (candidates.claimableWinner[0]) or a Withdrawn (candidates.withdrawn[0])", async () => {
    async function voteANonActiveCandidate(nonActiveCandidateName: string) {
      try {
        await program.methods
          .voteCandidateWithHxuiLite(nonActiveCandidateName, new BN(1))
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
        assert.equal(code, "OnlyActiveCandidateCanBeVoted");
      }
    }

    await voteANonActiveCandidate(newCandidates.winner[0].name);
    await voteANonActiveCandidate(newCandidates.claimableWinner[0].name);
    await voteANonActiveCandidate(newCandidates.withdrawn[0].name);
  });

  it("Attempt to claim tokens for a non active candidate before a withdraw window given such candidates have NON-ZERO receipts.", async () => {
    async function claimTokens(
      nonActiveCandidate: Candidate,
      owner: Keypair,
      error: string,
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );
      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has Zero receipts",
      );

      assert(
        candidateState.claimWindow.eq(new BN(0)),
        "Claim window is either live or closed.",
      );
      const [receiptAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          Buffer.from(nonActiveCandidate.name),
          owner.publicKey.toBuffer(),
        ],
        program.programId,
      );
      const voteReceipt = await connection.getAccountInfo(receiptAddress);
      assert(voteReceipt != null);
      try {
        await program.methods
          .claimTokens(nonActiveCandidate.name)
          .accounts({ owner: owner.publicKey })
          .signers([owner])
          .rpc();
      } catch ({
        error: {
          errorCode: { code },
        },
      }) {
        assert.equal(code, error);
      }
    }

    // each candidate has exactly one receipt of users[0].
    await claimTokens(
      newCandidates.winner[1],
      users[0],
      "TokensCannotBeClaimed",
    );
    await claimTokens(
      newCandidates.claimableWinner[1],
      users[0],
      "UnclaimableNow",
    );
    await claimTokens(newCandidates.withdrawn[1], users[0], "UnclaimableNow");
  });

  // newCandidates = {
  //     claimableWinner:[0(0),1(1),2(1)],
  //     winner:[0(0),1(1)],
  //     withdrawn:[1(0),1(1),2(1)]
  //   }
  it("Attempt to close non active candidates before a withdraw window given all candidates have NON-ZERO receipts.", async () => {
    async function closeNonActiveCandidate(
      nonActiveCandidate: Candidate,
      error?: string,
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );

      //before a withrdraw window
      assert(
        candidateState.claimWindow.eq(new BN(0)),
        "Claim window is either live or closed.",
      );

      // non-zero receipts.
      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has non-zero receipts",
      );
      try {
        await program.methods
          .closeCandidate(nonActiveCandidate.name)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(false);
      } catch ({
        error: {
          errorCode: { code },
        },
      }) {
        assert.equal(code, error);
      }
    }
    await closeNonActiveCandidate(
      newCandidates.winner[1],
      "CloseAllReceiptAccount",
    );
    await closeNonActiveCandidate(
      newCandidates.claimableWinner[1],
      "OpenWithdrawWindowFirst",
    );
    await closeNonActiveCandidate(
      newCandidates.withdrawn[1],
      "OpenWithdrawWindowFirst",
    );
  });

  // newCandidates = {
  //     claimableWinner:[0(0),1(1),2(1)],
  //     winner:[0(0),1(1)],
  //     withdrawn:[1(0),1(1),2(1)]
  //   }

  it("Attempt to clear receipts for non active candidates before a withdraw window given all candidates have NON-ZERO receipts.", async () => {
    async function clearReceiptForNonActiveCandidate(
      nonActiveCandidate: Candidate,
      receiptHolder?: Keypair, // for additional check.
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has non-zero receipts",
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );

      assert(
        candidateState.claimWindow.eq(new BN(0)),
        "Claim window is either live or closed.",
      );

      // are bytes reversed (little endian) ?
      const allVoteReceipts = await program.account.voteReceipt.all([
        {
          memcmp: {
            encoding: "base58",
            offset: 8,
            bytes: bs58.encode([candidateState.id]),
          },
        },
      ]);

      if (receiptHolder) {
        const [receiptHolderVoteReceipt] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("vote_receipt"),
            Buffer.from(nonActiveCandidate.name),
            receiptHolder.publicKey.toBuffer(),
          ],
          program.programId,
        );

        assert.equal(
          !!allVoteReceipts.find((eachReceipt) =>
            eachReceipt.publicKey.equals(receiptHolderVoteReceipt),
          ),
          true,
        );
      }

      const tx = new Transaction();
      const ixns: TransactionInstruction[] = [];
      for (let i = 0; i < allVoteReceipts.length; i++) {
        const ixn = await program.methods
          .clearReceipt(nonActiveCandidate.name)
          .accounts({
            // @ts-ignore
            admin: adminPubkey,
            voteReceipt: allVoteReceipts[i].publicKey,
          })
          .instruction();
        ixns.push(ixn);
      }
      tx.add(...ixns);
      await provider.sendAndConfirm(tx, [admin]);
    }
    // This ixn basically runs a "Crank script" that fetches all the vote receipt accounts for a candidate and close them given the conditions are met and send the lamports to the vault.

    try {
      // This should pass as the status of this candidate is winner with 1 receipt, it can be closed before the opening of withdraw window. In fact this candidate cannot open a withdraw window because no tokens will be minted back.
      const candidate = newCandidates.winner[1];

      const candidateStateBefore = await program.account.candidate.fetch(
        candidate.address,
      );

      const [userReceiptAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          Buffer.from(candidate.name),
          users[0].publicKey.toBuffer(),
        ],
        program.programId,
      );
      // const receiptAccountStateBefore = await program.account.voteReceipt.fetch(
      //   userReceiptAddress,
      // );

      const vaultBalanceBefore = await getBalance(hxuiVaultAddress);
      const receiptBalanceBefore =
        await connection.getBalance(userReceiptAddress);
      const tokenAddress = getAssociatedTokenAddressSync(
        hxuiMintAddress,
        users[0].publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const {
        value: { uiAmount: tokenBalanceBefore },
      } = await connection.getTokenAccountBalance(tokenAddress);
      await clearReceiptForNonActiveCandidate(candidate, users[0]);

      const candidateStateAfter = await program.account.candidate.fetch(
        candidate.address,
      );
      const vaultBalanceAfter = await getBalance(hxuiVaultAddress);

      const {
        value: { uiAmount: tokenBalanceAfter },
      } = await connection.getTokenAccountBalance(tokenAddress);
      const receiptBalanceAfter =
        await connection.getBalance(userReceiptAddress);

      assert(receiptBalanceAfter == 0);
      assert.equal(
        vaultBalanceAfter - vaultBalanceBefore,
        receiptBalanceBefore,
      );
      assert(
        candidateStateBefore.totalReceipts
          .sub(candidateStateAfter.totalReceipts)
          .eq(new BN(1)),
      );
      assert.equal(tokenBalanceAfter, tokenBalanceBefore);
    } catch (err) {
      assert(false);
    }
    try {
      await clearReceiptForNonActiveCandidate(
        newCandidates.claimableWinner[1],
        users[0],
      );
      assert(false);
    } catch (err) {
      assert(true);
    }
    try {
      await clearReceiptForNonActiveCandidate(
        newCandidates.withdrawn[1],
        users[0],
      );
      assert(false);
    } catch (err) {
      assert(true);
    }
  });

  // newCandidate.winner[1] HAS 0 RECEIPTS NOW. USE IT WITH CONSIDERTION.
  // newCandidates = {
  //     claimableWinner:[0(0),1(1),2(1)],
  //     winner:[0(0),1(0)],
  //     withdrawn:[1(0),1(1),2(1)]
  //   }

  it("Attempt to close Non-active candidates before a withdraw window given all candidates have ZERO receipts.", async () => {
    async function closeNonActiveCandidate(
      nonActiveCandidate: Candidate,
      error?: string,
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );
      assert(
        candidateState.claimWindow.eq(new BN(0)),
        "Claim window is either live or closed.",
      );

      assert.equal(
        candidateState.totalReceipts.isZero(),
        true,
        "Candidate has non-zero receipts",
      );
      try {
        await program.methods
          .closeCandidate(nonActiveCandidate.name)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(true);
      } catch (err) {
        assert(false);
      }
    }

    await closeNonActiveCandidate(
      // Previous test cleared all the receipts in winner[1]. Will be passed
      newCandidates.winner[1],
    );

    await closeNonActiveCandidate(newCandidates.claimableWinner[0]);
    await closeNonActiveCandidate(newCandidates.withdrawn[0]);
  });
  // newCandidates.winner[1], newCandidates.claimableWinner[0], newCandidates.withdrawn[0] IS CLOSED.
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(1),2(1)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(1),2(1)]
  //   }
  it("Open a withdraw window for non active canidates ", async () => {
    const now = await getBlockTime();
    const withdrawWindow = new BN(now + 5); // 5 secs from now.

    try {
      await program.methods
        .openClaimableWindow(newCandidates.winner[0].name, withdrawWindow)
        .accounts({ admin: adminPubkey })
        .signers([admin])
        .rpc();
    } catch ({
      error: {
        errorCode: { code },
      },
    }) {
      assert.equal(code, "CanBeClosedImmediatelyWithoutWithdrawWindow");
      // Ideally should throw "CanBeClosedImmediatelyByClearingReceipts"..The enchountered error is due to 0 receipts.
    }
    for (const candidateName of [
      newCandidates.withdrawn[1].name,
      newCandidates.claimableWinner[1].name,
    ]) {
      try {
        await program.methods
          .openClaimableWindow(candidateName, withdrawWindow)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(true);
      } catch (err) {
        assert(false);
      }
    }
  });

  it("Attempts to clear receipts during a withdraw window for Non active candidates except winner having non zero receipts", async () => {
    async function clearReceiptForNonActiveCandidate(
      nonActiveCandidate: Candidate,
      receiptHolder?: Keypair, // for additional check.
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has non-zero receipts",
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );

      const now = await getBlockTime();
      assert(
        candidateState.claimWindow.cmp(new BN(now)) != -1,
        "Claim window is not closed",
      );
      const allVoteReceipts = await program.account.voteReceipt.all([
        {
          memcmp: {
            encoding: "base58",
            offset: 8,
            bytes: bs58.encode([candidateState.id]),
          },
        },
      ]);

      if (receiptHolder) {
        const [receiptHolderVoteReceipt] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("vote_receipt"),
            Buffer.from(nonActiveCandidate.name),
            receiptHolder.publicKey.toBuffer(),
          ],
          program.programId,
        );

        assert.equal(
          !!allVoteReceipts.find((eachReceipt) =>
            eachReceipt.publicKey.equals(receiptHolderVoteReceipt),
          ),
          true,
        );
      }

      const tx = new Transaction();
      const ixns: TransactionInstruction[] = [];
      for (let i = 0; i < allVoteReceipts.length; i++) {
        const ixn = await program.methods
          .clearReceipt(nonActiveCandidate.name)
          .accounts({
            // @ts-ignore
            admin: adminPubkey,
            voteReceipt: allVoteReceipts[i].publicKey,
          })
          .instruction();
        ixns.push(ixn);
      }
      tx.add(...ixns);
      await provider.sendAndConfirm(tx, [admin]);
    }
    // Must fail during a withdraw window, the winner can never open a withdraw window.
    try {
      await clearReceiptForNonActiveCandidate(newCandidates.claimableWinner[1]);
      assert(false);
    } catch (err) {
      assert(true);
      // "WaitUntilWithdrawWindowIsClosed. verified
    }
    try {
      await clearReceiptForNonActiveCandidate(newCandidates.withdrawn[1]);
      assert(false);
    } catch (err) {
      assert(true);
      // "WaitUntilWithdrawWindowIsClosed. verified
    }
  });
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(1),2(1)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(1),2(1)]
  //   }
  it("Attempt to close Non active candidates during a withdraw window given all candidates has Non zero receipts.", async () => {
    async function closeNonActiveCandidate(
      nonActiveCandidate: Candidate,
      error?: string,
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has non-zero receipts",
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );

      const now = await getBlockTime();
      assert(
        candidateState.claimWindow.cmp(new BN(now)) != -1,
        "Claim window is not closed",
      );
      try {
        await program.methods
          .closeCandidate(nonActiveCandidate.name)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(false);
      } catch ({
        error: {
          errorCode: { code },
        },
      }) {
        assert.equal(code, error);
      }
    }

    await closeNonActiveCandidate(
      newCandidates.claimableWinner[1],
      "WaitUntilWithdrawWindowIsClosed",
    );
    await closeNonActiveCandidate(
      newCandidates.withdrawn[1],
      "WaitUntilWithdrawWindowIsClosed",
    );
  });

  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(1),2(1)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(1),2(1)]
  //   }
  it("Attempt to claim tokens for a non active candidate during a withdraw window given each non active candidate have NON-ZERO receipts.", async () => {
    async function claimTokensDuringWithdrawWindow(
      nonActiveCandidate: Candidate,
      owner: Keypair,
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has zero receipts",
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );

      const now = await getBlockTime();
      assert(
        candidateState.claimWindow.cmp(new BN(now)) != -1,
        "Claim window is not closed",
      );
      const [receiptAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          Buffer.from(nonActiveCandidate.name),
          owner.publicKey.toBuffer(),
        ],
        program.programId,
      );
      const voteReceipt = await connection.getAccountInfo(receiptAddress);
      assert(voteReceipt != null, "a");

      const candidateStateBefore = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      const [userReceiptAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          Buffer.from(nonActiveCandidate.name),
          users[0].publicKey.toBuffer(),
        ],
        program.programId,
      );
      const receiptAccountState =
        await program.account.voteReceipt.fetch(userReceiptAddress);

      const vaultBalanceBefore = await getBalance(hxuiVaultAddress);
      const receiptBalanceBefore =
        await connection.getBalance(userReceiptAddress);
      const tokenAddress = getAssociatedTokenAddressSync(
        hxuiMintAddress,
        users[0].publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const {
        value: { uiAmount: tokenBalanceBefore },
      } = await connection.getTokenAccountBalance(tokenAddress);
      await program.methods
        .claimTokens(nonActiveCandidate.name)
        .accounts({ owner: owner.publicKey })
        .signers([owner])
        .rpc();

      const candidateStateAfter = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );
      const vaultBalanceAfter = await getBalance(hxuiVaultAddress);

      const {
        value: { uiAmount: tokenBalanceAfter },
      } = await connection.getTokenAccountBalance(tokenAddress);
      const receiptBalanceAfter =
        await connection.getBalance(userReceiptAddress);

      assert(receiptBalanceAfter == 0);
      assert.equal(
        vaultBalanceAfter - vaultBalanceBefore,
        receiptBalanceBefore,
        "b",
      );
      assert(
        candidateStateBefore.totalReceipts
          .sub(candidateStateAfter.totalReceipts)
          .eq(new BN(1)),
        "c",
      );

      if (candidateStateBefore.candidateStatus.claimableWinner) {
        assert(
          receiptAccountState.tokens
            .div(new BN(2))
            .eq(new BN(tokenBalanceAfter - tokenBalanceBefore)),
          "d",
        );
      } else if (candidateStateBefore.candidateStatus.claimableWinner) {
        assert(
          receiptAccountState.tokens.eq(
            new BN(tokenBalanceAfter - tokenBalanceBefore),
          ),
          "e",
        );
      }
    }

    await claimTokensDuringWithdrawWindow(
      newCandidates.claimableWinner[1],
      users[0],
    );

    await claimTokensDuringWithdrawWindow(newCandidates.withdrawn[1], users[0]);
  });
  // newCandidates.winner[1] AND newCandidates.withdrawn[1] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(0),2(1)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(0),2(1)]
  //   }

  it("Attempt to close a Non active candidate during a withdraw window given each non active candidate has exactly 0 receipts", async () => {
    async function closeNonActiveCandidate(nonActiveCandidate: Candidate) {
      try {
        await program.methods
          .closeCandidate(nonActiveCandidate.name)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(true);
      } catch (err) {
        assert(false);
      }
    }
    await closeNonActiveCandidate(newCandidates.claimableWinner[1]);
    await closeNonActiveCandidate(newCandidates.withdrawn[1]);
  });
  // newCandidates.winner[1] AND newCandidates.withdrawn[1] RECEIPTS ARE CLEARED AND CLOSED.
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(0,closed),2(1)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(0,closed),2(1)]
  //   }

  it("Open and close withdraw window for non withdrawn and claimable winner candidate.", async () => {
    const now = await getBlockTime();
    const withdrawWindow = new BN(now + 2); // 2 secs from now.

    for (const candidate of [
      newCandidates.withdrawn[2],
      newCandidates.claimableWinner[2],
    ]) {
      try {
        await program.methods
          .openClaimableWindow(candidate.name, withdrawWindow)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(true);
      } catch (err) {
        assert(false);
      }
    }
    await sleep(3);
    for (const candidate of [
      newCandidates.withdrawn[2],
      newCandidates.claimableWinner[2],
    ]) {
      const candidateState = await program.account.candidate.fetch(
        candidate.address,
      );
      const now = await getBlockTime();
      assert(candidateState.claimWindow.cmp(new BN(now)) == -1);
    }
  });

  it("Attempt to claim tokens for a non active candidate after the withdraw window where each candidate has NON ZERO receipts.", async () => {
    async function claimTokens(
      nonActiveCandidate: Candidate,
      owner: Keypair,
      error: string,
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert(
        !candidateState.candidateStatus.active,
        "cannot claim tokens from an active candidate.",
      );
      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has Zero receipts",
      );

      const now = await getBlockTime();
      assert(candidateState.claimWindow.cmp(new BN(now)) == -1, "a");
      const [receiptAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          Buffer.from(nonActiveCandidate.name),
          owner.publicKey.toBuffer(),
        ],
        program.programId,
      );
      const voteReceipt = await connection.getAccountInfo(receiptAddress);
      assert(voteReceipt != null);
      try {
        await program.methods
          .claimTokens(nonActiveCandidate.name)
          .accounts({ owner: owner.publicKey })
          .signers([owner])
          .rpc();
      } catch ({
        error: {
          errorCode: { code },
        },
      }) {
        assert.equal(code, error);
      }
    }

    await claimTokens(
      newCandidates.claimableWinner[2],
      users[0], // claimed by
      "UnclaimableNow",
    );
    await claimTokens(newCandidates.withdrawn[2], users[0], "UnclaimableNow");
  });
  // No change.
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(0,closed),2(1)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(0,closed),2(1)]
  //   }
  it("Attempt to close a Non active candidate after a withdraw window given each non active candidate have NON ZERO receipts.", async () => {
    // Non zero receipts
    async function closeNonActiveCandidate(nonActiveCandidate: Candidate) {
      try {
        await program.methods
          .closeCandidate(nonActiveCandidate.name)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(false);
      } catch ({
        error: {
          errorCode: { code },
        },
      }) {
        assert(code, "CloseAllReceiptAccount.");
      }
    }
    await closeNonActiveCandidate(newCandidates.claimableWinner[2]);
    await closeNonActiveCandidate(newCandidates.withdrawn[2]);
  });
  // No change.
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(0,closed),2(1)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(0,closed),2(1)]
  //   }
  it("Attempt to clear receipts for a non active candidate after a withdraw window where each non active candidate have non zero receipts", async () => {
    async function clearReceipts(
      nonActiveCandidate: Candidate,
      receiptHolder?: Keypair, // for additional check.
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      const [userReceiptAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_receipt"),
          Buffer.from(nonActiveCandidate.name),
          users[0].publicKey.toBuffer(),
        ],
        program.programId,
      );
      // const receiptAccountStateBefore = await program.account.voteReceipt.fetch(
      //   userReceiptAddress,
      // );

      const vaultBalanceBefore = await getBalance(hxuiVaultAddress);
      const receiptBalanceBefore =
        await connection.getBalance(userReceiptAddress);
      const tokenAddress = getAssociatedTokenAddressSync(
        hxuiMintAddress,
        users[0].publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const {
        value: { uiAmount: tokenBalanceBefore },
      } = await connection.getTokenAccountBalance(tokenAddress);

      assert.equal(
        candidateState.totalReceipts.isZero(),
        false,
        "Candidate has non-zero receipts",
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );

      const now = await getBlockTime();
      assert(
        candidateState.claimWindow.cmp(new BN(now)) == -1,
        "Claim window is either live or closed.",
      );
      const allVoteReceipts = await program.account.voteReceipt.all([
        {
          memcmp: {
            encoding: "base58",
            offset: 8,
            bytes: bs58.encode([candidateState.id]),
          },
        },
      ]);

      if (receiptHolder) {
        const [receiptHolderVoteReceipt] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("vote_receipt"),
            Buffer.from(nonActiveCandidate.name),
            receiptHolder.publicKey.toBuffer(),
          ],
          program.programId,
        );

        assert.equal(
          !!allVoteReceipts.find((eachReceipt) =>
            eachReceipt.publicKey.equals(receiptHolderVoteReceipt),
          ),
          true,
        );
      }

      const tx = new Transaction();
      const ixns: TransactionInstruction[] = [];
      for (let i = 0; i < allVoteReceipts.length; i++) {
        const ixn = await program.methods
          .clearReceipt(nonActiveCandidate.name)
          .accounts({
            // @ts-ignore
            admin: adminPubkey,
            voteReceipt: allVoteReceipts[i].publicKey,
          })
          .instruction();
        ixns.push(ixn);
      }
      tx.add(...ixns);
      await provider.sendAndConfirm(tx, [admin]);

      const candidateStateAfter = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );
      const vaultBalanceAfter = await getBalance(hxuiVaultAddress);

      const {
        value: { uiAmount: tokenBalanceAfter },
      } = await connection.getTokenAccountBalance(tokenAddress);
      const receiptBalanceAfter =
        await connection.getBalance(userReceiptAddress);

      assert(receiptBalanceAfter == 0);
      assert.equal(
        vaultBalanceAfter - vaultBalanceBefore,
        receiptBalanceBefore,
      );
      assert(
        candidateState.totalReceipts
          .sub(candidateStateAfter.totalReceipts)
          .eq(new BN(1)),
      );
      assert.equal(tokenBalanceAfter, tokenBalanceBefore);
    }
    await clearReceipts(newCandidates.claimableWinner[2], users[0]); // users[0] is for asserting..ixn does not require.
    await clearReceipts(newCandidates.withdrawn[2], users[0]);
  });

  // newCandidates.claimableWinner[2] and newCandidates.withdrawn[2] RECEIPTS ARE CLEARED.
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(0,closed),2(0)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(0,closed),2(0)]
  //   }

  it("Attempt to close Non-active candidates after a withdraw window given all candidates have ZERO receipts.", async () => {
    async function closeNonActiveCandidate(
      nonActiveCandidate: Candidate,
      error?: string,
    ) {
      const candidateState = await program.account.candidate.fetch(
        nonActiveCandidate.address,
      );

      assert(
        !candidateState.candidateStatus.active,
        "An active candidate is attempted to close",
      );
      const now = await getBlockTime();
      assert(
        candidateState.claimWindow.cmp(new BN(now)) == -1,
        "Claim window is not closed",
      );

      assert.equal(
        candidateState.totalReceipts.isZero(),
        true,
        "Candidate has non-zero receipts",
      );
      try {
        await program.methods
          .closeCandidate(nonActiveCandidate.name)
          .accounts({ admin: adminPubkey })
          .signers([admin])
          .rpc();
        assert(true);
      } catch (err) {
        assert(false);
      }
    }

    await closeNonActiveCandidate(newCandidates.claimableWinner[2]);
    await closeNonActiveCandidate(newCandidates.withdrawn[2]);
  });

  // newCandidates.claimableWinner[2] and newCandidates.withdrawn[2] RECEIPTS ARE CLOSED.
  // newCandidates = {
  //     claimableWinner:[0(0,closed),1(0,closed),2(0,closed)],
  //     winner:[0(0),1(0,closed)],
  //     withdrawn:[1(0,closed),1(0,closed),2(0,closed)]
  //   }
});

// describe("temp", () => {
//   it("", async () => {
//     await program.methods
//       .temp()
//       .accounts({ admin: adminPubkey })
//       .signers([admin])
//       .rpc();

//     const [address] = PublicKey.findProgramAddressSync(
//       [Buffer.from("hxui_tem")],
//       program.programId,
//     );

//     const account = await program.account.accountWithEnum.fetch(address);
//     console.log(!!account.myEnum.monday == false);
//     console.log(!!account.myEnum.tuesday == true);
//   });
// });
describe("6)Safe withdrawl from the vault ixn testing..", () => {
  async function getMinimumVaultBalance() {
    const mint = await getMint(
      connection,
      hxuiMintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const voteReceiptRent = await getRent(21);
    const minimumVaultBalance =
      (await getRent(0)) + Math.floor(Number(mint.supply)) * voteReceiptRent;
    return minimumVaultBalance;
  }
  it("Attempt withdrawl from non-admin");
  it("Attempt to withdraw amount greater than the vault can afford, must FAIL");
  it(
    "Withdraw maximum amount possible from the vault WITHOUT explicitly passing the amount.",
  );
  it("Withdraw maximum amount possible from the vault");
  it(
    "Withdraw maximum amount possible from the vault WITH explicitly passing the amount.",
  );
});

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
