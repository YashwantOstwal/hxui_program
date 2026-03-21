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

describe("Crank script testing. ~40 secs.", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const { connection } = provider;
  //   const { payer } = provider.wallet;

  const program = anchor.workspace.hxui as Program<Hxui>;

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

  const getVoteReceiptAddress = (candidateName: string, owner: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote_receipt"),
        Buffer.from(candidateName),
        owner.toBuffer(),
      ],
      program.programId,
    )[0];
  };

  const admin = new Keypair();
  const voters: Keypair[] = [];
  const [vaultAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("hxui_vault")],
    program.programId,
  );
  const candidateNames = ["component-1", "component-2"];
  const candidateAddresses = candidateNames.map(
    (candidateName) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("hxui_candidate"), Buffer.from(candidateName)],
        program.programId,
      )[0],
  );
  // First candidate will have 0 as its id and second will have id 1 and so on.
  const candidateIds = [0, 1];
  before(async () => {
    await airdrop(admin.publicKey, LAMPORTS_PER_SOL);
    const pricePerToken = new anchor.BN(0.001 * LAMPORTS_PER_SOL);
    const tokensPerVote = new anchor.BN(2);
    const freetokensPerMint = new anchor.BN(1);
    const freeMintsPerEpoch = new anchor.BN(100);
    const freeMintCoolDown = new anchor.BN(43200);
    const minVotesToWin = new anchor.BN(10);
    await program.methods
      .initDui(
        pricePerToken,
        tokensPerVote,
        freetokensPerMint,
        freeMintsPerEpoch,
        freeMintCoolDown,
        minVotesToWin,
      )
      .accounts({
        admin: admin.publicKey,
        liteAuthority: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const maxClearIxsInATx = 13;
    // + Math.floor(Math.random() * 4);
    for (let i = 0; i < maxClearIxsInATx; i++) {
      const newVoter = new Keypair();
      await airdrop(newVoter.publicKey, 0.1 * LAMPORTS_PER_SOL);
      voters.push(newVoter);
    }

    for (let i = 0; i < candidateNames.length; i++) {
      const now = await getBlockTime();
      const pollEndsAt = new BN(now + 2);
      await program.methods
        .setDropTime(pollEndsAt)
        .accounts({
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();
      await program.methods
        .createCandidate(candidateNames[i], "description", false)
        .accounts({ admin: admin.publicKey })
        .signers([admin])
        .rpc();

      for (let j = 0; j < maxClearIxsInATx; j++) {
        const voteCount = new BN(Math.floor(Math.random() * 10) + 10);

        // Buying enough tokens to vote.
        const numberOfTokens = voteCount.mul(tokensPerVote);
        await program.methods
          .buyTokens(numberOfTokens)
          .accounts({
            owner: voters[j].publicKey,
          })
          .signers([voters[j]])
          .rpc();
        await program.methods
          .voteWithHxui(candidateNames[i], voteCount)
          .accounts({ owner: voters[j].publicKey })
          .signers([voters[j]])
          .rpc();
        const voteReceiptAddress = getVoteReceiptAddress(
          candidateNames[i],
          voters[j].publicKey,
        );
        const voteReceiptsForCandidate1 = await program.account.voteReceipt.all(
          [
            {
              memcmp: {
                encoding: "base58",
                offset: 8,
                bytes: bs58.encode([candidateIds[i]]),
              },
            },
          ],
        );

        // vote receipt for this newVoter exists.
        assert(
          voteReceiptsForCandidate1.findIndex(({ publicKey }) =>
            publicKey.equals(voteReceiptAddress),
          ) !== -1,
        );
      }
      // }

      // wait until the poll is ended.
      await sleep(2.1);

      // drawing the winner.
      await program.methods
        .drawWinner()
        .remainingAccounts([
          {
            pubkey: candidateAddresses[i],
            isSigner: false,
            isWritable: true,
          },
        ])
        .signers([]) // provider.wallet bared the network fees.
        .rpc();
    }
  });

  it("Verified all the receipts for a candidate (first candidate) is cleared given just the candidate Id and the vault is credited with expected lamports on clearance.", async () => {
    const candidate1StateBefore = await program.account.hxuiCandidate.fetch(
      candidateAddresses[0],
    );
    const vaultStateBefore = await connection.getBalance(vaultAddress);
    const voteReceiptsForCandidate1 = await program.account.voteReceipt.all([
      {
        memcmp: {
          encoding: "base58",
          offset: 8,
          bytes: bs58.encode([candidateIds[0]]),
        },
      },
    ]);

    const clearIxs: TransactionInstruction[] = [];
    for (let i = 0; i < voteReceiptsForCandidate1.length; i++) {
      const clearIx = await program.methods
        .closeVoteReceipt(candidateNames[0])
        .accounts({
          // @ts-ignore
          admin: admin.publicKey,
          voteReceipt: voteReceiptsForCandidate1[i].publicKey,
        })
        .instruction();
      clearIxs.push(clearIx);
    }

    const tx = new Transaction().add(...clearIxs);
    await provider.sendAndConfirm(tx, [admin]);

    const voteReceiptsForCandidate1AfterClearance =
      await program.account.voteReceipt.all([
        {
          memcmp: {
            encoding: "base58",
            offset: 8,
            bytes: bs58.encode([candidateIds[0]]),
          },
        },
      ]);
    const candidate1StateAfter = await program.account.hxuiCandidate.fetch(
      candidateAddresses[0],
    );
    const vaultBalanceAfter = await connection.getBalance(vaultAddress);

    const voteReceiptRent =
      await connection.getMinimumBalanceForRentExemption(21);

    // all the vote receipts for candidates[0] are closed
    assert(candidate1StateAfter.receiptCount.isZero());
    assert(voteReceiptsForCandidate1AfterClearance.length == 0);

    // rent of all the closed receipts is credited back to the vault.
    assert(
      new BN(vaultBalanceAfter - vaultStateBefore).eq(
        candidate1StateBefore.receiptCount.mul(new BN(voteReceiptRent)),
      ),
    );

    // Redundant verification of all the vote receipts for candidates[0] are closed.
    for (let i = 0; i < voters.length; i++) {
      const voteReceiptAddress = getVoteReceiptAddress(
        candidateNames[0],
        voters[i].publicKey,
      );
      const voteReceiptAccount =
        await connection.getAccountInfo(voteReceiptAddress);
      assert.equal(voteReceiptAccount, null);
    }
  });

  it("None of the receipts of other candidates (second candidate) are cleared.", async () => {
    // while the vote receipts for rest of the candidates are not cleared.
    let voteReceiptAccountCounts = 0;
    for (let i = 0; i < voters.length; i++) {
      const voteReceiptAddress = getVoteReceiptAddress(
        candidateNames[1],
        voters[i].publicKey,
      );
      // const voteReceiptAccountInfo =
      //   await connection.getAccountInfo(voteReceiptAddress);
      // if (voteReceiptAccountInfo != null) {
      const voteReceiptState =
        await program.account.voteReceipt.fetch(voteReceiptAddress);
      assert.equal(voteReceiptState.id, candidateIds[1]);
      voteReceiptAccountCounts++;
      // }
    }
    const candidate2State = await program.account.hxuiCandidate.fetch(
      candidateAddresses[1],
    );
    assert(candidate2State.receiptCount.eq(new BN(voteReceiptAccountCounts)));
  });
});
