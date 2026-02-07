use anchor_lang::prelude::*;

use crate::{Poll,CustomError,Config};
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

pub fn pick_winner<'info>(ctx:Context<'_, '_, '_, 'info,PickWinner>)->Result<()>{
    let clock = Clock::get()?;

    let poll = &mut ctx.accounts.hxui_poll;
    require!(clock.unix_timestamp > poll.current_poll_deadline,CustomError::PollIsLive);
    require!(!poll.current_poll_winner_drawn,CustomError::WinnerForCurrentPollAlreadyDrawn);
    //winner picking logic 

    poll.current_poll_winner_drawn = true;
    Ok(())
}