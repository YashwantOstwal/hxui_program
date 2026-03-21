use anchor_lang::prelude::*;
use crate::{FreeMintTracker, CustomError};

#[derive(Accounts)]
pub struct ClaimRegistrationDeposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [b"free_mint_tracker", owner.key().as_ref()],
        bump = free_mint_tracker.bump
    )]
    pub free_mint_tracker: Account<'info, FreeMintTracker>,
}

pub fn process_claim_registration_deposit(ctx: Context<ClaimRegistrationDeposit>) -> Result<()> {
    let clock = Clock::get()?;
    let free_mint_tracker = &ctx.accounts.free_mint_tracker;
    require!(free_mint_tracker.unregistered, CustomError::MustUnregisterFirst);
    require!(
        clock.unix_timestamp >= free_mint_tracker.next_mint_timestamp,
        CustomError::FeeClaimCooldownActive
    );
    Ok(())
}

