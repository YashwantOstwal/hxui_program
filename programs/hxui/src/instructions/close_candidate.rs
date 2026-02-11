use anchor_lang::prelude::*;

use crate::{Candidate, CandidateStatus, Config, CustomError};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct CloseCandidate<'info>{
    pub admin:Signer<'info>,


    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

    #[account(
        mut,
        close = hxui_vault,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,

    )]
    pub hxui_candidate:Account<'info,Candidate>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

}

pub fn close_candidate_account(ctx:Context<CloseCandidate>)->Result<()>{
    let candidate: &mut Account<'_, Candidate> = &mut ctx.accounts.hxui_candidate;
    
    require!(candidate.candidate_status != CandidateStatus::Active,CustomError::ActiveCandidateCannotBeClosed);


    let clock = Clock::get()?;
          let is_withdrawn = candidate.candidate_status == CandidateStatus::Withdrawn;
    let is_claimable_winner = candidate.candidate_status == CandidateStatus::ClaimableWinner;

    // A withdrawn candidate and a claimable winner candidate can be closed immediately if it has non zero receipts.
    if (is_withdrawn || is_claimable_winner) && candidate.total_receipts!=0 {
        require!(candidate.claim_window!=0 && clock.unix_timestamp > candidate.claim_window ,CustomError::OpenWithdrawWindowFirst);
    }
    require!(candidate.total_receipts == 0,CustomError::CloseAllReceiptAccount);
    

    Ok(())
}