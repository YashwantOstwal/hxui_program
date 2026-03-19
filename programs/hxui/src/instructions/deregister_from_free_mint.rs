use anchor_lang::prelude::*;
use crate::{FreeMintTracker,CustomError};
#[derive(Accounts)]
pub struct DeregisterFromFreeMint<'info>{
    pub owner:Signer<'info>,

    #[account(
        mut,
        seeds = [b"free_mint_tracker",owner.key().as_ref()],
        bump = free_mint_tracker.bump
    )]
    pub free_mint_tracker:Account<'info,FreeMintTracker>,

}

pub fn process_deregister_from_free_mint(ctx:Context<DeregisterFromFreeMint>)->Result<()>{
    let free_mint_tracker = &mut ctx.accounts.free_mint_tracker;
    require!(!free_mint_tracker.unregistered,CustomError::AlreadyUnregistered);
    free_mint_tracker.unregistered = true;
    Ok(())
}