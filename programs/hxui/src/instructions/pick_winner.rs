use anchor_lang::prelude::*;

use crate::{Poll,CustomError};
#[derive(Accounts)]
pub struct PickWinner<'info>{
    // #[account(

    // )]

    #[account(
        mut,
        seeds = [b"hxui_poll"],
        bump = hxui_poll.bump
    )]
    pub hxui_poll: Account<'info,Poll>
}
pub fn pick_winner(ctx:Context<PickWinner>)->Result<()>{
    let clock = Clock::get()?;
    require!(clock.unix_timestamp > ctx.accounts.hxui_poll.current_poll_deadline,CustomError::PollIsLive);
    //winner picking logic 

    ctx.accounts.hxui_poll.current_poll_winner_drawn = true;
    Ok(())
}