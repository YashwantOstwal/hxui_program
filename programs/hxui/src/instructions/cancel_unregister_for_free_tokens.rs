use anchor_lang::prelude::*;

use crate::{FreeTokenTimestamp};
#[derive(Accounts)]
pub struct CancelUnRegisterForFreeTokens<'info>{
    pub owner:Signer<'info>,

    #[account(
        mut,
        seeds = [b"minted_timestamp",owner.key().as_ref()],
        bump = hxui_lite_minted_timestamp.bump
    )]
    pub hxui_lite_minted_timestamp:Account<'info,FreeTokenTimestamp>,
}

pub fn reset_close_time(ctx:Context<CancelUnRegisterForFreeTokens>)->Result<()>{
    let hxui_lite_minted_timestamp = &mut ctx.accounts.hxui_lite_minted_timestamp;
    hxui_lite_minted_timestamp.closable_timestamp = 0;
    Ok(())
}