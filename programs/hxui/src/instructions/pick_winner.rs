use anchor_lang::prelude::*;

use crate::{Poll,CustomError,Config,Candidate};
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
pub fn pick_winner(ctx:Context<PickWinner>)->Result<()>{
    let clock = Clock::get()?;

    let poll = &mut ctx.accounts.hxui_poll;
    require!(clock.unix_timestamp > poll.current_poll_deadline,CustomError::PollIsLive);
    require!(!poll.current_poll_winner_drawn,CustomError::WinnerForCurrentPollAlreadyDrawn);
    //winner picking logic 
    let candidate_ids = &poll.current_poll_candidates;

    // let mut candidates: Vec<Candidate> = Vec::new();
    for i in 0..candidate_ids.len() {
        let unchecked_account = ctx.remaining_accounts.get(i).ok_or(CustomError::MissingCandidate)?;
        let candidate:Account<Candidate> = Account::try_from(unchecked_account)?;
    }



    poll.current_poll_winner_drawn = true;

    // also remove the winner candidate from the poll.current_poll_candidates.
    Ok(())
}