use anchor_lang::prelude::*;

use crate::{HxuiCandidate, CandidateStatus, HxuiConfig, CustomError};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct OpenClaimBackWindow<'info> {
    pub admin: Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config: Account<'info, HxuiConfig>,
    
    #[account(
        mut,
        seeds = [b"hxui_candidate", name.as_bytes()],
        bump = hxui_candidate.bump,
    )]
    pub hxui_candidate: Account<'info, HxuiCandidate>,
}

pub fn process_open_claim_back_window(
    ctx: Context<OpenClaimBackWindow>,
    _name: String, 
    until: i64,
) -> Result<()> {
    let hxui_candidate = &mut ctx.accounts.hxui_candidate;

    if hxui_candidate.status == CandidateStatus::Active {
        return err!(CustomError::ActiveCandidateCannotOpenWithdrawWindow);
    } 
    
    if hxui_candidate.receipt_count == 0 {
        return err!(CustomError::CanBeClosedImmediatelyWithoutWithdrawWindow);
    }
    
    if hxui_candidate.status == CandidateStatus::Winner {
        return err!(CustomError::CanBeClosedImmediatelyByClearingReceipts);
    } 
    
    let clock = Clock::get()?;

    require!(until > clock.unix_timestamp, CustomError::InvalidClosetime);
    
    hxui_candidate.claim_deadline = until;
    
    Ok(())
}