use anchor_lang::prelude::*;
use crate::{HxuiCandidate, CandidateStatus, CustomError};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CloseCandidate<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        close = hxui_vault,
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
}

pub fn process_close_candidate(ctx: Context<CloseCandidate>) -> Result<()> {
    let hxui_candidate: &mut Account<'_, HxuiCandidate> = &mut ctx.accounts.hxui_candidate;

    if hxui_candidate.status == CandidateStatus::Active {
        return err!(CustomError::CannotCloseActiveCandidate)
    }

    let is_withdrawn = hxui_candidate.status == CandidateStatus::Withdrawn;
    let is_claimable_winner = hxui_candidate.status == CandidateStatus::ClaimableWinner;

    // A withdrawn hxui_candidate and a claimable winner hxui_candidate need not a withdraw window if receipts is 0.
    if (is_withdrawn || is_claimable_winner) && hxui_candidate.receipt_count != 0 {
        require!(hxui_candidate.claim_deadline != 0, CustomError::ClaimBackWindowNotOpen);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp > hxui_candidate.claim_deadline, CustomError::ClaimBackWindowStillOpen);
    }
    require!(hxui_candidate.receipt_count == 0, CustomError::PendingReceiptsExist);

    Ok(())
}

