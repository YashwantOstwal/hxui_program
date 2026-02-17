use anchor_lang::prelude::*;

use crate::{Candidate, CandidateStatus, Config, CustomError, Poll};
#[derive(Accounts)]
pub struct PickWinner<'info>{
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

    #[account(
        mut,
        seeds = [b"hxui_poll"],
        bump = hxui_poll.bump
    )]
    pub hxui_poll: Account<'info,Poll>
}

pub fn pick_winner<'info>(ctx:Context<'_, '_, 'info, 'info,PickWinner<'_>>)->Result<()>{
    let clock = Clock::get()?;


    let poll = &mut ctx.accounts.hxui_poll;
    require!(clock.unix_timestamp > poll.current_poll_deadline,CustomError::PollIsLive);
    require!(!poll.current_poll_winner_drawn,CustomError::WinnerForCurrentPollAlreadyDrawn);

    let mut missing_candidates = poll.current_poll_candidates.clone();
    let mut candidates= Vec::new();
    
    
    require!(!missing_candidates.is_empty(),CustomError::NoCandidates);
    require!(!ctx.remaining_accounts.is_empty(),CustomError::PassAllActiveCandidates);
    for account_info in ctx.remaining_accounts{
        let candidate:Account<Candidate> = Account::try_from(account_info)?;
        
       match missing_candidates.iter().position(|&x| x == candidate.id){
        Some(index)=>{
            missing_candidates.remove(index);
            candidates.push(candidate);
        },
        None=>{
            return err!(CustomError::InvalidCandidate)
        }
    }
}
    require!(missing_candidates.is_empty(),CustomError::PassAllActiveCandidates);
    // require!(candidates.len() == total_candidates,CustomError::);
    let mut winner_index = 0;

    for i in 1..candidates.len(){
        if candidates[i].number_of_votes > candidates[winner_index].number_of_votes || 
        (candidates[i].number_of_votes == candidates[winner_index].number_of_votes && 
            // id as tie-breaker smaller id signifies the candidate was enrolled before the other
        candidates[i].id < candidates[winner_index].id){
            winner_index = i;
        }
    }

    if candidates[winner_index].claimable_if_winner {
        candidates[winner_index].candidate_status = CandidateStatus::ClaimableWinner
    }else {
        candidates[winner_index].candidate_status = CandidateStatus::Winner

    }
    candidates[winner_index].exit(ctx.program_id)?;
    
    if let Some(index) = poll.current_poll_candidates.iter().position(|&x| x == candidates[winner_index].id){
        poll.current_poll_candidates.remove(index);
    }
    poll.current_poll_winner_drawn = true;
    Ok(())
}