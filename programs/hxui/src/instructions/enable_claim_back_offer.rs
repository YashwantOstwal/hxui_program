use anchor_lang::prelude::*;

use crate::{HxuiConfig,HxuiCandidate,CustomError,CandidateStatus};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct EnableClaimBackOffer<'info>{

    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config:Account<'info,HxuiConfig>,

    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
        constraint = hxui_candidate.status == CandidateStatus::Active @ CustomError::InactiveCandidateClaimBlocked,

    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>
}

pub fn process_enable_claim_back_offer(ctx:Context<EnableClaimBackOffer>)->Result<()>{
    let hxui_candidate = &mut ctx.accounts.hxui_candidate;
    hxui_candidate.claim_back_offer = true;

    Ok(())
}