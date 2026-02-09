use anchor_lang::prelude::*;

use crate::{ Candidate, CustomError,Config, VoteReceipt};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct CloseReceipt<'info>{
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

     #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    #[account(
        mut,
        close = hxui_vault,
        constraint = vote_receipt.id == hxui_candidate.id @ CustomError::InvalidReceiptForCandidate
    )]
    pub vote_receipt:Account<'info,VoteReceipt>,
   
}

pub fn close_receipt_account(ctx:Context<CloseReceipt>)->Result<()>{
    let candidate = &mut ctx.accounts.hxui_candidate;

    require!(!(candidate.is_winner == false && candidate.can_be_winner == true),CustomError::ActiveCandidateCannotBeClosed);
    let is_withdrawn:bool = candidate.can_be_winner == false && candidate.is_winner == false;
    let is_claimable_winner:bool = candidate.is_winner == true && candidate.claimable_if_winner == true;
    if is_withdrawn || is_claimable_winner {
        let clock = Clock::get()?;
       {
        require!(candidate.claim_window!=0 && clock.unix_timestamp > candidate.claim_window ,CustomError::OpenWithdrawWindowFirst);
    }
    }
    candidate.total_receipts -= 1;
    Ok(())
}