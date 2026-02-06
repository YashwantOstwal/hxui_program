use anchor_lang::prelude::*;

use crate::{Config,Poll,ANCHOR_DISCRIMINATOR,CustomError};
#[derive(Accounts)]
pub struct CreatePoll<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

    #[account(
        init_if_needed,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR + Poll::INIT_SPACE,
        seeds = [b"hxui_poll"],
        bump,
    )]
    pub hxui_poll:Account<'info,Poll>,

    pub system_program:Program<'info,System>
}

pub fn create_new_poll(ctx:Context<CreatePoll>,new_deadline:i64)->Result<()>{
    let poll = &mut ctx.accounts.hxui_poll;
    let clock: Clock = Clock::get()?;
    if poll.current_poll_deadline!=0 {
        require!(clock.unix_timestamp > poll.current_poll_deadline,CustomError::PollIsLive);
        require!(poll.current_poll_winner_drawn,CustomError::WinnerNotDrawn);
    }
    require!(new_deadline > clock.unix_timestamp,CustomError::InvalidDeadline);
        poll.current_poll_deadline = new_deadline;
        poll.current_poll_winner_drawn = false;
    poll.bump = ctx.bumps.hxui_poll;
    Ok(())
}