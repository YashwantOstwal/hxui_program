use anchor_lang::prelude::*;

use crate::{HxuiConfig,HxuiDropTime,CustomError};
#[derive(Accounts)]
pub struct CreatePoll<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,HxuiConfig>,

    #[account(
        mut,
        seeds = [b"hxui_drop_time"],
        bump = hxui_drop_time.bump,
    )]
    pub hxui_drop_time:Account<'info,HxuiDropTime>,

    pub system_program:Program<'info,System>
}

pub fn create_new_poll(ctx:Context<CreatePoll>,new_deadline:i64)->Result<()>{
    let poll = &mut ctx.accounts.hxui_drop_time;
    let clock: Clock = Clock::get()?;
    if poll.drop_timestamp!=0 {
        require!(clock.unix_timestamp > poll.drop_timestamp,CustomError::DrawTimeNotReached);
        require!(poll.is_winner_drawn,CustomError::PendingWinnerDraw);
    }
    require!(new_deadline > clock.unix_timestamp,CustomError::InvalidDropTime);
        poll.drop_timestamp = new_deadline;
        poll.is_winner_drawn = false;
    Ok(())
}