use anchor_lang::prelude::*;
use crate::{HxuiCandidate, CandidateStatus, HxuiConfig, CustomError, VoteReceipt};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CloseVoteReceipt<'info> {
    pub admin: Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config: Account<'info, HxuiConfig>,

    #[account(
        mut,
        seeds = [b"hxui_candidate", name.as_bytes()],
        bump = hxui_candidate.bump,
    )]
    pub hxui_candidate: Account<'info, HxuiCandidate>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault: SystemAccount<'info>,

    #[account(
        mut,
        close = hxui_vault,
        constraint = vote_receipt.id == hxui_candidate.id @ CustomError::ReceiptCandidateMismatch
    )]
    pub vote_receipt: Account<'info, VoteReceipt>,
}

pub fn process_close_vote_receipt(ctx: Context<CloseVoteReceipt>) -> Result<()> {
    let hxui_candidate = &mut ctx.accounts.hxui_candidate;

    // This ixn can only be invoked for vote receipts of hxui_candidate whose status is winner, withdrawn or claimable winner after the withdraw window is closed.
    // require!(hxui_candidate.status != CandidateStatus::Active,CustomError::CannotCloseActiveReceipts);

    hxui_candidate.receipt_count -= 1;

    match hxui_candidate.status {
        CandidateStatus::Active => {
            err!(CustomError::CannotCloseActiveReceipts)
        },
        CandidateStatus::Winner => {
            Ok(())
        },
        _ => {
            let clock = Clock::get()?;
            require!(hxui_candidate.claim_deadline != 0, CustomError::ClaimBackWindowNotOpen);
            require!(clock.unix_timestamp > hxui_candidate.claim_deadline, CustomError::ClaimBackWindowStillOpen);
            Ok(())
        }
    }
}
