use anchor_lang::prelude::*;

use anchor_spl::{
    token_interface::{Token2022},
};
use crate::{ANCHOR_DISCRIMINATOR, HxuiCandidate, CandidateStatus, HxuiConfig, CustomError, HxuiDropTime };

#[derive(Accounts)]
#[instruction(name:String,description:String)]
pub struct CreateCandidate<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,HxuiConfig>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR + HxuiCandidate::INIT_SPACE,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump,
        constraint = description.len() <= 280 @ CustomError::DescriptionTooLong
    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>,

    #[account(
        mut,
        seeds = [b"hxui_drop_time"],
        bump = hxui_drop_time.bump,
    )]
    pub hxui_drop_time:Account<'info,HxuiDropTime>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>,
}


pub fn initialise_candidate(ctx:Context<CreateCandidate>,name:String,description:String,claim_back_offer:bool)->Result<()>{
//    let claimable_basis_points_if_winner = match claimable_bps{
//         Some(basis_points)=>basis_points,
//         None=>5000
//     };
    let candidate  = &mut ctx.accounts.hxui_candidate;
    let poll = &mut ctx.accounts.hxui_drop_time;
    let id = poll.total_candidate_count;

    candidate.set_inner(HxuiCandidate { name, description, vote_count: 0,claim_back_offer, status:CandidateStatus::Active, bump: ctx.bumps.hxui_candidate,claim_deadline:0,id,receipt_count:0 });
    
    poll.active_candidate_ids.push(id);
    poll.total_candidate_count +=1;
    
    Ok(())
}
