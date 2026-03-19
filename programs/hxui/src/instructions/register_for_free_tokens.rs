use anchor_lang::prelude::*;

use crate::{ANCHOR_DISCRIMINATOR,FreeMintTracker};
#[derive(Accounts)]
pub struct RegisterFreeTokens<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = ANCHOR_DISCRIMINATOR + FreeMintTracker::INIT_SPACE,
        seeds = [b"free_mint_tracker",owner.key().as_ref()],
        bump
    )]
    pub free_mint_tracker:Account<'info,FreeMintTracker>,

    pub system_program:Program<'info,System>,
}

pub fn initialise_free_mint_tracker(ctx:Context<RegisterFreeTokens>)->Result<()>{
    let free_mint_tracker = &mut ctx.accounts.free_mint_tracker;
    let now = Clock::get()?.unix_timestamp;
    free_mint_tracker.next_mint_timestamp = now;
    free_mint_tracker.bump = ctx.bumps.free_mint_tracker;
    Ok(())
}