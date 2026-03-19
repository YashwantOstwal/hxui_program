use anchor_lang::prelude::*;

use crate::{HxuiConfig, HxuiDropTime, CustomError};

#[derive(Accounts)]
pub struct SetDropTime<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config: Account<'info, HxuiConfig>,

    #[account(
        mut,
        seeds = [b"hxui_drop_time"],
        bump = hxui_drop_time.bump,
    )]
    pub hxui_drop_time: Account<'info, HxuiDropTime>,

    pub system_program: Program<'info, System>
}

pub fn process_set_drop_time(ctx: Context<SetDropTime>, new_deadline: i64) -> Result<()> {
    let hxui_drop_time = &mut ctx.accounts.hxui_drop_time;
    let clock: Clock = Clock::get()?;
    
    if hxui_drop_time.drop_timestamp != 0 {
        require!(clock.unix_timestamp > hxui_drop_time.drop_timestamp, CustomError::DrawTimeNotReached);
        require!(hxui_drop_time.is_winner_drawn, CustomError::PendingWinnerDraw);
    }
    
    require!(new_deadline > clock.unix_timestamp, CustomError::InvalidDropTime);
    
    hxui_drop_time.drop_timestamp = new_deadline;
    hxui_drop_time.is_winner_drawn = false;
    
    Ok(())
}