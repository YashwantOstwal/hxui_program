use anchor_lang::prelude::*;

use crate::{CustomError,Candidate,Config};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct CloseCandidate<'info>{
    pub admin:Signer<'info>,


    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

    #[account(
        mut,
        close = hxui_vault,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,

    )]
    pub hxui_candidate:Account<'info,Candidate>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

}

pub fn close_candidate_account(ctx:Context<CloseCandidate>)->Result<()>{
    let candidate: &mut Account<'_, Candidate> = &mut ctx.accounts.hxui_candidate;
    require!(candidate.can_be_winner == false,CustomError::ActiveCandidateCannotBeClosed);

    let clock = Clock::get()?;
    // winner with claimable
    if (candidate.is_winner == true && candidate.claimable_if_winner == true) ||
    //withdrawn component.
    (candidate.is_winner == false && candidate.can_be_winner == false)
    {
        require!(candidate.claim_window!=0 && clock.unix_timestamp > candidate.claim_window ,CustomError::OpenWithdrawWindowFirst);
    }
    require!(candidate.total_receipts == 0,CustomError::CloseAllReceiptAccount);
    

    Ok(())
}