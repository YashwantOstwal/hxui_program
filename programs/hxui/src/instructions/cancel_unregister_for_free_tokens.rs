use anchor_lang::prelude::*;

use crate::{FreeMintTracker};
#[derive(Accounts)]
pub struct CancelUnRegisterForFreeTokens<'info>{
    pub owner:Signer<'info>,

    #[account(
        mut,
        seeds = [b"free_mint_tracker",owner.key().as_ref()],
        bump = free_mint_tracker.bump
    )]
    pub free_mint_tracker:Account<'info,FreeMintTracker>,
}

pub fn reset_close_time(ctx:Context<CancelUnRegisterForFreeTokens>)->Result<()>{
    let free_mint_tracker = &mut ctx.accounts.free_mint_tracker;
    free_mint_tracker.unregistered = false;
    Ok(())
}