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
        constraint = hxui_candidate.status == CandidateStatus::Active @ CustomError::OnlyActiveCandidateCanBeWithdrawn,
    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>,

        #[account(
        mut,
        seeds = [b"hxui_drop_time"],
        bump = hxui_drop_time.bump,
    )]
    pub hxui_drop_time:Account<'info,HxuiDropTime>,

}

pub fn stop_candidate(ctx:Context<WithdrawCandidate>)->Result<()>{
    let candidate = &mut ctx.accounts.hxui_candidate;
    candidate.status = CandidateStatus::Withdrawn;

    let poll = &mut ctx.accounts.hxui_drop_time;
  if let Some(index) = poll.active_candidate_ids.iter().position(|&id| id == candidate.id){
    poll.active_candidate_ids.remove(index);
  }
    Ok(())
}