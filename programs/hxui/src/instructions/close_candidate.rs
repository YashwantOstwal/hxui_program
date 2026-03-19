use anchor_lang::prelude::*;

use crate::{HxuiCandidate, CandidateStatus, CustomError};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct CloseCandidate<'info>{
    pub admin:Signer<'info>,

    #[account(
        mut,
        close = hxui_vault,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,

    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

}

pub fn close_candidate_account(ctx:Context<CloseCandidate>)->Result<()>{
    let candidate: &mut Account<'_, HxuiCandidate> = &mut ctx.accounts.hxui_candidate;
    
    if candidate.status == CandidateStatus::Active {
        return err!(CustomError::ActiveCandidateCannotBeClosed)
    }

    let is_withdrawn = candidate.status == CandidateStatus::Withdrawn;
    let is_claimable_winner = candidate.status == CandidateStatus::ClaimableWinner;

    // A withdrawn candidate and a claimable winner candidate need not a withdraw window if receipts is 0.
    if (is_withdrawn || is_claimable_winner) && candidate.receipt_count!=0 {
        require!(candidate.claim_deadline!=0 ,CustomError::OpenWithdrawWindowFirst);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp > candidate.claim_deadline,CustomError::WaitUntilWithdrawWindowIsClosed);
    }
    require!(candidate.receipt_count == 0,CustomError::CloseAllReceiptAccount);
    
    Ok(())
}