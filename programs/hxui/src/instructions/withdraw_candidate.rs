use anchor_lang::prelude::*;

use crate::{Candidate,CustomError,Poll, CandidateStatus};

#[derive(Accounts)]
#[instruction(name:String)]
pub struct WithdrawCandidate<'info>{

    pub admin:Signer<'info>,

    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
        constraint = hxui_candidate.candidate_status == CandidateStatus::Active @ CustomError::OnlyActiveCandidateCanBeWithdrawn,
    )]
    pub hxui_candidate:Account<'info,Candidate>,

        #[account(
        mut,
        seeds = [b"hxui_poll"],
        bump = hxui_poll.bump,
    )]
    pub hxui_poll:Account<'info,Poll>,

}

pub fn stop_candidate(ctx:Context<WithdrawCandidate>)->Result<()>{
    let candidate = &mut ctx.accounts.hxui_candidate;
    candidate.candidate_status = CandidateStatus::Withdrawn;

    let poll = &mut ctx.accounts.hxui_poll;
  if let Some(index) = poll.current_poll_candidates.iter().position(|&id| id == candidate.id){
    poll.current_poll_candidates.remove(index);
  }
    Ok(())
}