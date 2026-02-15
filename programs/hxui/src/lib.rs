pub mod instructions;
pub mod states;
pub mod constants;
pub mod errors;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use states::*;
pub use constants::*;
pub use errors::*;

declare_id!("EpF1FNjziFb8wrR1p5usVW1AbcU7saCt8deoiVY31zE7");
#[program]
pub mod hxui {

    use super::*;

    pub fn initialise_dapp(ctx:Context<InitialiseDapp>,price_per_token:u64,tokens_per_vote:u64)->Result<()>{
        let config_bump: u8  = ctx.bumps.hxui_config;
        let admin_pubkey: Pubkey = ctx.accounts.admin.key();
        instructions::initialise_dapp::initialise_config(
            ctx,
            Config { 
                admin:admin_pubkey,
                price_per_token,
                tokens_per_vote,
                bump:config_bump
            }
        )

        
    }
    pub fn create_poll(ctx:Context<CreatePoll>,poll_deadline:i64)->Result<()>{
        instructions::create_poll::create_new_poll(ctx, poll_deadline)
    }

pub fn draw_winner<'info>(ctx:Context<'_, '_, 'info, 'info,PickWinner<'_>>)->Result<()>{
            instructions::pick_winner::pick_winner(ctx)
    }

    pub fn register_for_free_tokens(ctx:Context<RegisterFreeTokens>)->Result<()>{
        instructions::register_for_free_tokens::initialise_hxui_lite_minted_timestamp(ctx)
    }  

    pub fn unregister_for_free_tokens(ctx:Context<UnregisterFreeTokens>)->Result<()>{
        instructions::unregister_for_free_tokens::set_close_time(ctx)
    }

    pub fn cancel_unregister_for_free_tokens(ctx:Context<CancelUnRegisterForFreeTokens>)->Result<()>{
        instructions::cancel_unregister_for_free_tokens::reset_close_time(ctx)
    }

      pub fn claim_registration_fees(ctx:Context<ClaimRegistration>)->Result<()>{
        instructions::claim_registration::close_last_minted_timestamp(ctx)
    }

    pub fn mint_free_tokens(ctx:Context<MintFreeTokens>)->Result<()>{
        instructions::mint_free_tokens::mint_tokens_for_free(ctx,1)
    }
    
    pub fn create_candidate(ctx:Context<CreateCandidate>,name:String,description:String,
    claimable_if_winner:bool)->Result<()>{
        instructions::create_candidate::initialise_candidate(ctx,name,description,
        claimable_if_winner)
    }
    pub fn close_candidate(ctx:Context<CloseCandidate>,_name:String)->Result<()>{
        instructions::close_candidate::close_candidate_account(ctx)
    }
    pub fn open_claimable_window(ctx:Context<OpenClaimableWindow>,_name:String,until:i64)->Result<()>{
        instructions::open_claimable_window::set_closable_time(ctx,until)
    }
   
    // pub fn fund_admin_for_candidate(ctx:Context<FundAdminForCandidate>)->Result<()>{
    //     instructions::fund_admin_for_candidate::transfer_rent_to_admin(ctx)
    // }

     pub fn buy_paid_tokens(ctx:Context<BuyPaidTokens>,amount:u64)->Result<()>{
        instructions::buy_paid_tokens::payment(&ctx,&amount)?;
        instructions::buy_paid_tokens::mint_tokens(ctx,amount)
    }

    pub fn safe_withdraw_from_vault(ctx:Context<SafeWithdrawFromVault>,amount:Option<u64>)->Result<()>{
        instructions::safe_withdraw_from_vault::transfer_to_admin(ctx,amount)
    }
    pub fn vote_candidate(ctx:Context<VoteCandidate>,_name:String,votes:u64)->Result<()>{
        instructions::vote_candidate::vote(ctx,votes)
    }

    pub fn vote_candidate_with_hxui_lite(ctx:Context<VoteCandidateWithHxuiLite>,_name:String,votes:u64)->Result<()>{
        instructions::vote_candidate_with_hxui_lite::vote_with_hxui_lite(ctx,votes)
    }
    
    pub fn withdraw_candidate(ctx:Context<WithdrawCandidate>,_name:String)->Result<()>{
        instructions::withdraw_candidate::stop_candidate(ctx)
    }
    
    pub fn claim_tokens(ctx:Context<ClaimTokens>,_name:String)->Result<()>{
        instructions::claim_tokens::claim_back_tokens(ctx)
    }

    pub fn clear_receipt(ctx:Context<ClearReceipt>,_name:String)->Result<()>{
        instructions::clear_receipt::close_receipt_account(ctx)
    }

    pub fn create_new_account(ctx:Context<CreateNewAccount>)->Result<()>{
        instructions::create_new_account::create(ctx)
}
pub fn initialise_account(ctx:Context<InitialiseNewAccount>)->Result<()>{
    ctx.accounts.new_account.id = 5;
    Ok(())
}}


