use anchor_lang::prelude::*;

use crate::{FreeTokenTimestamp,CustomError};


#[derive(Accounts)]
pub struct ClaimRegistration<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [b"minted_timestamp",owner.key().as_ref()],
        bump = hxui_lite_minted_timestamp.bump
    )]
    pub hxui_lite_minted_timestamp:Account<'info,FreeTokenTimestamp>,
}

pub fn close_last_minted_timestamp(ctx:Context<ClaimRegistration>)->Result<()>{
    let clock = Clock::get()?;
    let hxui_lite_minted_timestamp = &ctx.accounts.hxui_lite_minted_timestamp;
    require!(hxui_lite_minted_timestamp.closable_timestamp !=0,CustomError::UnregisterFirst);
    require!(clock.unix_timestamp >= hxui_lite_minted_timestamp.closable_timestamp,CustomError::UnclaimableYet);
    Ok(())
}
