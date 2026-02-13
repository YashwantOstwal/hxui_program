use anchor_lang::prelude::*;

use crate::{Candidate, CandidateStatus, Config, CustomError};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct OpenClaimableWindow<'info>{
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,
    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
    )]
    pub hxui_candidate:Account<'info,Candidate>,

}

pub fn set_closable_time(ctx:Context<OpenClaimableWindow>,until:i64)->Result<()>{
    let candidate: &mut Account<'_, Candidate> = &mut ctx.accounts.hxui_candidate;

    if candidate.candidate_status == CandidateStatus::Active {
        return err!(CustomError::ActiveCandidateCannotOpenWithdrawWindow)
    } 
    if candidate.total_receipts == 0 {
        return err!(CustomError::CanBeClosedImmediatelyWithoutWithdrawWindow)
    }
     if candidate.candidate_status == CandidateStatus::Winner {
        return err!(CustomError::CanBeClosedImmediatelyByClearingReceipts)
    } 
    let clock = Clock::get()?;

    require!(until > clock.unix_timestamp,CustomError::InvalidClosetime);
    
    candidate.claim_window = until;
    Ok(())
}