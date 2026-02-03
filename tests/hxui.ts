import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hxui } from "../target/types/hxui";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import assert from "assert";
const { BN } = anchor;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.hxui as Program<Hxui>;

const { connection } = provider;
const { payer } = provider.wallet;

const admin = payer.publicKey;
const liteAuthority = new Keypair();

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
const [hxuiMintAddress] = PublicKey.findProgramAddressSync(
  [Buffer.from("hxui_mint")],
  program.programId,
);

const adminAssociatedTokenAddress = getAssociatedTokenAddressSync(
  hxuiLiteMintAddress,
  admin,
  false,
  TOKEN_2022_PROGRAM_ID,
);
let adminHxuiLiteTokenBalance = 0;

describe("1) initialise_dapp instruction testing", () => {
  it("1.1) Inits the config account!", async () => {
    const pricePerToken = new BN(0.001 * LAMPORTS_PER_SOL);
    const tokensPerVote = new BN(2);
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
        admin,
        liteAuthority: liteAuthority.publicKey,
      })
      .rpc();

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
            admin: payer.publicKey,
            liteAuthority: liteAuthority.publicKey,
          })
          .rpc(),
    );

    const [hxuiConfigAddress, hxuiConfigBump] =
      PublicKey.findProgramAddressSync(
        [Buffer.from("hxui_config")],
        program.programId,
      );
    const hxuiConfigAccount = await program.account.config.fetch(
      hxuiConfigAddress,
    );
    // config check
    assert(hxuiConfigAccount.admin.equals(admin));
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
            admin: payer.publicKey,
            liteAuthority: liteAuthority.publicKey,
            // tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc(),
    );
  });
  it("1.3) HXUI mint test", async () => {
    const hxuiMint = await connection.getAccountInfo(hxuiMintAddress);
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
    const [hxuiVaultAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("hxui_vault")],
      program.programId,
    );

    // Account exists
    const vaultAccount = await connection.getAccountInfo(hxuiVaultAddress);
    assert.notEqual(vaultAccount, null);

    // Account funded with exactly minimum lamports to exempt rent
    const rent = await connection.getMinimumBalanceForRentExemption(0);
    const vaultAccountBalance = await connection.getBalance(hxuiVaultAddress);
    assert.equal(vaultAccountBalance, rent);
  });
});

// describe("2) create_poll instruction testing", () => {
//   const [pollAddress, pollBump] = PublicKey.findProgramAddressSync(
//     [Buffer.from("hxui_poll")],
//     program.programId,
//   );
//   it("2.1) Creating genesis poll", async () => {
//     const currentBlockTime = await getBlockTime();
//     const deadline = new BN(currentBlockTime + 3); // this is .
//     await assert.doesNotReject(
//       async () =>
//         await program.methods
//           .createPoll(deadline)
//           .accounts({
//             admin,
//           })
//           .rpc(),
//     );
//     const pollAccount = await program.account.poll.fetch(pollAddress);
//     assert.equal(pollAccount.bump, pollBump);
//     assert(pollAccount.currentPollDeadline.eq(deadline));
//     assert.equal(pollAccount.currentPollWinnerDrawn, false);
//   });
//   it("2.2) Cannot pick winner before the deadline", async () => {
//     try {
//       await program.methods.drawWinner().rpc();
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
//   it("2.3) Cannot create a new poll before the deadline when the winner is not drawn (cannot be drawn before the deadline)", async () => {
//     const blockTime = await getBlockTime();
//     const deadline = new BN(blockTime + 3);
//     try {
//       await program.methods
//         .createPoll(deadline)
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
//       assert.equal(code, "PollIsLive");
//     }
//   });

//   it("2.4) Current Poll has ended", async () => {
//     await sleep(4);
//     const pollAccount = await program.account.poll.fetch(pollAddress);
//     const currentBlockTime = await getBlockTime();

//     assert(pollAccount.currentPollDeadline.toNumber() < currentBlockTime);
//   });
//   it("2.5) Cannot create a new poll after the deadline when the winner is not drawn (can be drawn after the deadline)", async () => {
//     const blockTime = await getBlockTime();
//     const deadline = new BN(blockTime + 120);
//     //Should fail.
//     try {
//       await program.methods
//         .createPoll(deadline)
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
//       assert.equal(code, "WinnerNotDrawn");
//     }
//   });
//   it("2.6) Winner is drawn", async () => {
//     await assert.doesNotReject(
//       async () => await program.methods.drawWinner().rpc(),
//     );
//     const pollAccount = await program.account.poll.fetch(pollAddress);
//     assert.equal(pollAccount.currentPollWinnerDrawn, true);
//   });

//   it("2.7) A new poll can be created but failed due to deadline being smaller than the current time", async () => {
//     const currentBlockTime = await getBlockTime();
//     const deadline = new BN(currentBlockTime - 3); // this is .
//     try {
//       await program.methods
//         .createPoll(deadline)
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
//       assert.equal(code, "InvalidDeadline");
//     }
//   });

//   it("2.8) A new poll created.", async () => {
//     const currentBlockTime = await getBlockTime();
//     const deadline = new BN(currentBlockTime + 3);
//     await assert.doesNotReject(
//       async () =>
//         await program.methods
//           .createPoll(deadline)
//           .accounts({
//             admin,
//           })
//           .rpc(),
//     );
//     const pollAccount = await program.account.poll.fetch(pollAddress);
//     //initialised again

//     assert.equal(pollAccount.bump, pollBump);
//     assert(pollAccount.currentPollDeadline.eq(deadline));
//     assert.equal(pollAccount.currentPollWinnerDrawn, false);
//   });
// });

// describe("3) register_for_free_tokens instruction testing", () => {
//   it("3.1) Created a new associated token account of hxiui lite mint for admin.", async () => {
//     //associated token account does not exist
//     assert.equal(
//       await connection.getAccountInfo(adminAssociatedTokenAddress),
//       null,
//     );
//     try {
//       await program.methods
//         .registerForFreeTokens()
//         .accounts({
//           owner: admin,
//         })
//         .rpc();
//     } catch (err) {
//       console.log(err);
//     }

//     const [mintedTimestampAddress, mintedTimestampBump] =
//       PublicKey.findProgramAddressSync(
//         [Buffer.from("minted_timestamp"), admin.toBuffer()],
//         program.programId,
//       );

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(mintedTimestampAddress);

//     //succesfully registered
//     assert.equal(mintedTimestampAccount.bump, mintedTimestampBump);
//     assert.equal(mintedTimestampAccount.lastMintedTimestamp, 0);

//     // this fails. always.
//     //     await getAccount(
//     //       connection,
//     //       adminTokenAddress,
//     //       "confirmed",
//     //       TOKEN_2022_PROGRAM_ID,
//     //     ),
//     // its okay, below is the work around.

//     //verifying the token account of hxui lite mint owned by the admin
//     const adminAssociatedTokenAccount =
//       await connection.getTokenAccountsByOwner(admin, {
//         mint: hxuiLiteMintAddress,
//       });

//     //is an associated token account.
//     //  index 0 -> in assumption that no other token account of this mint is owned by admin.
//     assert(
//       adminAssociatedTokenAccount.value[0].pubkey.equals(
//         adminAssociatedTokenAddress,
//       ),
//     );

//     //  token 2022 is the owner program
//     assert(
//       adminAssociatedTokenAccount.value[0].account.owner.equals(
//         TOKEN_2022_PROGRAM_ID,
//       ),
//     );

//     const {
//       value: { amount },
//     } = await connection.getTokenAccountBalance(adminAssociatedTokenAddress);
//     //balance is 0
//     assert.equal(amount, adminHxuiLiteTokenBalance);
//   });
// });

// describe("4) mint_free_tokens instruction testing", async () => {
//   const [mintedTimestampAddress] = PublicKey.findProgramAddressSync(
//     [Buffer.from("minted_timestamp"), admin.toBuffer()],
//     program.programId,
//   );
//   it("4.1) minting free token", async () => {
//     await program.methods
//       .mintFreeTokens()
//       .accounts({
//         owner: admin,
//         liteAuthority: liteAuthority.publicKey,
//       })
//       .signers([liteAuthority])
//       .rpc();

//     const {
//       value: { amount: currentBalance },
//     } = await connection.getTokenAccountBalance(adminAssociatedTokenAddress);

//     assert.equal(currentBalance, ++adminHxuiLiteTokenBalance);
//     const now = await getBlockTime();

//     const mintedTimestampAccount =
//       await program.account.freeTokenTimestamp.fetch(mintedTimestampAddress);

//     // the right mint time (current time) is stored on chain.
//     assert(mintedTimestampAccount.lastMintedTimestamp.eq(new BN(now)), "4.1");
//   }),
//     it("4.2) minting free token before cooldown (before 5 secs)", async () => {
//       //Should fail.
//       try {
//         await program.methods
//           .mintFreeTokens()
//           .accounts({
//             owner: admin,
//             liteAuthority: liteAuthority.publicKey,
//           })
//           .signers([liteAuthority])
//           .rpc();
//         assert(false);
//       } catch ({
//         error: {
//           errorCode: { code },
//         },
//       }) {
//         assert.equal(code, "RateLimitExceeded");
//       }
//     }),
//     it("4.3) minting free token after cooldown (after 5 secs)", async () => {
//       await sleep(5);
//       await program.methods
//         .mintFreeTokens()
//         .accounts({
//           owner: admin,
//           liteAuthority: liteAuthority.publicKey,
//         })
//         .signers([liteAuthority])
//         .rpc();

//       const {
//         value: { amount: currentBalance },
//       } = await connection.getTokenAccountBalance(adminAssociatedTokenAddress);

//       assert.equal(currentBalance, ++adminHxuiLiteTokenBalance);
//       const now = await getBlockTime();

//       const mintedTimestampAccount =
//         await program.account.freeTokenTimestamp.fetch(mintedTimestampAddress);

//       // the right mint time (current time) is stored on chain.
//       assert(mintedTimestampAccount.lastMintedTimestamp.eq(new BN(now)), "4.3");
//     }).slow(10000);
// });

describe("5) create_candidate instruction testing", () => {
  const [hxuiVaultAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_vault")],
    program.programId,
  );

  const [hxuiMintAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_mint")],
    program.programId,
  );

  const createCandidate = async (name: string, description: string) => {
    const fundAdminIxn = await program.methods
      .fundAdminForCandidate()
      .accounts({ admin })
      .instruction();
    const createAndIntialiseIxn = await program.methods
      .createCandidate(name, description)
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

  const name = "Lorem ipsum dolor sit amet, 1234";
  const description =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in volu..";

  const [candidateAddress, candidateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_candidate"), Buffer.from(name)],
    program.programId,
  );

  const [candidateVoterAddress, candidateVoterBump] =
    PublicKey.findProgramAddressSync(
      [Buffer.from("hxui_candidate_component_voters"), Buffer.from(name)],
      program.programId,
    );
  it("5.1) Create and initialise the candidate and candidate_voters account.", async () => {
    const vaultAccountBalance = await connection.getBalance(hxuiVaultAddress);

    const candidateAccountMinimumBalance =
      await connection.getMinimumBalanceForRentExemption(8 + 331);

    const candidateVotersAccountMinimumBalance =
      await connection.getMinimumBalanceForRentExemption(8 + 5);

    const hxuiMintData = await getMint(
      connection,
      hxuiMintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    const [hxuiConfigAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("hxui_config")],
      program.programId,
    );
    const hxuiConfigAccount = await program.account.config.fetch(
      hxuiConfigAddress,
    );

    const minimumVaultBalanceToRecordVoters =
      (await connection.getMinimumBalanceForRentExemption(
        Math.floor(
          Number(hxuiMintData.supply) /
            hxuiConfigAccount.tokensPerVote.toNumber(),
        ) * 40,
      )) - (await connection.getMinimumBalanceForRentExemption(0));

    await airdrop(
      hxuiVaultAddress,
      candidateAccountMinimumBalance +
        candidateVotersAccountMinimumBalance +
        minimumVaultBalanceToRecordVoters,
    );
    const vaultAccountBalanceBeforeCandidateCreation =
      await connection.getBalance(hxuiVaultAddress);

    //airdropped lamports equal to creation of a candidate.
    assert.equal(
      vaultAccountBalanceBeforeCandidateCreation,
      vaultAccountBalance +
        candidateAccountMinimumBalance +
        candidateVotersAccountMinimumBalance +
        minimumVaultBalanceToRecordVoters,
    );

    const adminBalanceBefore = await connection.getBalance(admin);
    assert(description.length <= 280);

    await createCandidate(name, description);

    const adminBalanceAfter = await connection.getBalance(admin);
    //admin as mediator, network fee of 5000 lamports bared by the admin.
    assert.equal(adminBalanceAfter, adminBalanceBefore - 5000);

    const vaultAccountBalanceAfterCandidateCreation =
      await connection.getBalance(hxuiVaultAddress);
    // exempted rent of candidate and candidate_voters.
    assert.equal(
      vaultAccountBalanceAfterCandidateCreation,
      vaultAccountBalance + minimumVaultBalanceToRecordVoters,
    );

    const candidateAccountBalance = await connection.getBalance(
      candidateAddress,
    );
    //candidate account balances equals the minimum rent exemption;
    assert.equal(candidateAccountBalance, candidateAccountMinimumBalance);

    const candidateVotersAccountBalance = await connection.getBalance(
      candidateVoterAddress,
    );

    //candidate_voters account balances equals the minimum rent exemption;
    assert.equal(
      candidateVotersAccountBalance,
      candidateVotersAccountMinimumBalance,
    );

    //verifying the accounts state
    const candidateAccount = await program.account.candidate.fetch(
      candidateAddress,
    );

    assert.equal(candidateAccount.name, name);
    assert.equal(candidateAccount.description, description);
    assert.equal(candidateAccount.isWinner, false);
    assert.equal(candidateAccount.isVotable, true);
    assert.equal(candidateAccount.bump, candidateBump);

    const candidateVotersAccount = await program.account.candidateVoters.fetch(
      candidateVoterAddress,
    );

    assert.equal(candidateVotersAccount.bump, candidateVoterBump);
    assert.equal(candidateVotersAccount.voters.length, 0);
  });
});
