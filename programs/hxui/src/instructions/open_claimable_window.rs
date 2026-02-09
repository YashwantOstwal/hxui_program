use anchor_lang::prelude::*;

use crate::{CustomError,Candidate,Config};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct OpenClaimableWindow<'info>{
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,
    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
    )]
    pub hxui_candidate:Account<'info,Candidate>,

}

pub fn set_closable_time(ctx:Context<OpenClaimableWindow>,until:i64)->Result<()>{
    let candidate: &mut Account<'_, Candidate> = &mut ctx.accounts.hxui_candidate;
    require!(!(candidate.is_winner == true && candidate.claimable_if_winner == false),CustomError::CanBeClosedImmediately);
    require!(candidate.can_be_winner == false,CustomError::ActiveCandidateCannotBeClosed);
    let clock = Clock::get()?;
    require!(until > clock.unix_timestamp,CustomError::InvalidClosetime);
    candidate.claim_window = until;
    Ok(())
}