use anchor_lang::prelude::*;

use crate::{FreeTokenTimestamp,CustomError};
#[derive(Accounts)]
pub struct UnregisterFreeTokens<'info>{
    pub owner:Signer<'info>,

    #[account(
        mut,
        seeds = [b"minted_timestamp",owner.key().as_ref()],
        bump = hxui_lite_minted_timestamp.bump
    )]
    pub hxui_lite_minted_timestamp:Account<'info,FreeTokenTimestamp>,

}

pub fn set_close_time(ctx:Context<UnregisterFreeTokens>)->Result<()>{
    let hxui_lite_minted_timestamp = &mut ctx.accounts.hxui_lite_minted_timestamp;
    require!(hxui_lite_minted_timestamp.close_timestamp > 0,CustomError::AlreadyUnregistered);
    let clock = Clock::get()?;
    
    hxui_lite_minted_timestamp.close_timestamp = clock.unix_timestamp + 3600 * 12;
    Ok(())
}