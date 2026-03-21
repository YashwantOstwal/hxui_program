use anchor_lang::prelude::*;

use crate::{HxuiCandidate, CandidateStatus, HxuiConfig, CustomError, HxuiDropTime};
#[derive(Accounts)]
pub struct DrawWinner<'info>{

    #[account(
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,HxuiConfig>,

    #[account(
        mut,
        seeds = [b"hxui_drop_time"],
        bump = hxui_drop_time.bump
    )]
    pub hxui_drop_time: Account<'info,HxuiDropTime>
}

pub fn process_draw_winner<'info>(ctx:Context<'_, '_, 'info, 'info,DrawWinner<'_>>)->Result<()>{
    let clock = Clock::get()?;


    let hxui_drop_time = &mut ctx.accounts.hxui_drop_time;
    require!(clock.unix_timestamp > hxui_drop_time.drop_timestamp,CustomError::DrawTimeNotReached);
    require!(!hxui_drop_time.is_winner_drawn,CustomError::WinnerForCurrentPollAlreadyDrawn);

    let mut missing_candidates = hxui_drop_time.active_candidate_ids.clone();
    let mut candidates= Vec::new();
    
    
    require!(!missing_candidates.is_empty(),CustomError::NoCandidates); // no active candidates to pick a winner from
    require!(!ctx.remaining_accounts.is_empty(),CustomError::PassAllActiveCandidates);
    for account_info in ctx.remaining_accounts{
        let candidate:Account<HxuiCandidate> = Account::try_from(account_info)?;
        
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
    let mut winner_index = 0;

    for i in 1..candidates.len(){
        if candidates[i].vote_count > candidates[winner_index].vote_count || 
        (candidates[i].vote_count == candidates[winner_index].vote_count && 
            // id as tie-breaker smaller id signifies the candidate was enrolled before the other
        candidates[i].id < candidates[winner_index].id){
            winner_index = i;
        }
    }

    let hxui_config = &mut ctx.accounts.hxui_config;
    require!(candidates[winner_index].vote_count >= hxui_config.min_votes_to_win,CustomError::NotEnoughVotesForWinner); 
    if candidates[winner_index].claim_back_offer {
        candidates[winner_index].status = CandidateStatus::ClaimableWinner
    }else {
        candidates[winner_index].status = CandidateStatus::Winner

    }
    candidates[winner_index].exit(ctx.program_id)?;
    
    if let Some(index) = hxui_drop_time.active_candidate_ids.iter().position(|&x| x == candidates[winner_index].id){
        hxui_drop_time.active_candidate_ids.remove(index);
    }
    hxui_drop_time.is_winner_drawn = true;
    Ok(())
}