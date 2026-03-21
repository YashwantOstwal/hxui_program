use anchor_lang::prelude::*;

use crate::{HxuiCandidate,CustomError,HxuiDropTime, CandidateStatus};

#[derive(Accounts)]
#[instruction(name:String)]
pub struct WithdrawCandidate<'info>{

    pub admin:Signer<'info>,

    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
        constraint = hxui_candidate.status == CandidateStatus::Active @ CustomError::InactiveCandidateWithdrawal,
    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>,

        #[account(
        mut,
        seeds = [b"hxui_drop_time"],
        bump = hxui_drop_time.bump,
    )]
    pub hxui_drop_time:Account<'info,HxuiDropTime>,

}

pub fn process_withdraw_candidate(ctx:Context<WithdrawCandidate>)->Result<()>{
    let hxui_candidate = &mut ctx.accounts.hxui_candidate;
    hxui_candidate.status = CandidateStatus::Withdrawn;

    let hxui_drop_time = &mut ctx.accounts.hxui_drop_time;
  if let Some(index) = hxui_drop_time.active_candidate_ids.iter().position(|&id| id == hxui_candidate.id){
    hxui_drop_time.active_candidate_ids.remove(index);
  }
    Ok(())
}