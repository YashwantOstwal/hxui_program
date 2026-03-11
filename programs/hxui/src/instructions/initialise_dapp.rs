use anchor_lang::{prelude::*, system_program::{Transfer, CreateAccount, create_account, transfer}};
use anchor_spl::{
    token_2022::spl_token_2022::{extension::ExtensionType, pod::PodMint}, token_interface::{ InitializeMint2, MetadataPointerInitialize, Mint, NonTransferableMintInitialize, Token2022, TokenMetadataInitialize, initialize_mint2, metadata_pointer_initialize, non_transferable_mint_initialize, token_metadata_initialize}
};
use spl_token_metadata_interface::state::TokenMetadata;
use spl_type_length_value::variable_len_pack::VariableLenPack;


use crate::{ANCHOR_DISCRIMINATOR, Config, CustomError, FREE_TOKENS_PER_EPOCH, FreeTokensCounter, VoteReceipt};
#[derive(Accounts)]
pub struct InitialiseDapp<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    pub lite_authority :Signer<'info>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = hxui_mint,
        extensions::metadata_pointer::metadata_address = hxui_mint
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_config"],
        bump,
        space = ANCHOR_DISCRIMINATOR + Config::INIT_SPACE
    )]
    pub hxui_config: Account<'info,Config>,
    
    #[account(
        mut,
        seeds = [b"hxui_lite_mint"],
        bump,
    )]
    pub hxui_lite_mint:SystemAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_free_tokens_counter"],
        bump,
        space = ANCHOR_DISCRIMINATOR + FreeTokensCounter::INIT_SPACE
    )]
    pub free_tokens_counter:Account<'info,FreeTokensCounter>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>
}

pub struct TokenMetadataArgs {
    name:String,
    symbol:String,
    uri:String,
}
pub fn initialise_config(ctx:Context<InitialiseDapp>,config:Config)->Result<()>{
    let rent = Rent::get()?;
    require!(2* config.price_per_token >= rent.minimum_balance(VoteReceipt::INIT_SPACE) ,CustomError::TokenPriceNotSufficient);
    let config_account = &mut ctx.accounts.hxui_config;
    config_account.set_inner(config);

    let free_tokens_counter = &mut ctx.accounts.free_tokens_counter;
    free_tokens_counter.bump = ctx.bumps.free_tokens_counter;
    free_tokens_counter.current_epoch = (Clock::get()?).epoch;
    free_tokens_counter.remaining_free_tokens = FREE_TOKENS_PER_EPOCH;

    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{
        from:ctx.accounts.admin.to_account_info(),
        to:ctx.accounts.hxui_vault.to_account_info()
    });
    let rent = Rent::get()?;
    transfer(cpi_context, rent.minimum_balance(0))?;

    let hxui_metadata   = TokenMetadataArgs{name:"100xui".to_string(),symbol:"HXUI".to_string(),uri:"https://100xui.com/metadata/hxui/metadata.json".to_string()};

    let hxui_metadata_state = TokenMetadata{
        name:hxui_metadata.name.clone(),
        uri:hxui_metadata.uri.clone(),
        symbol:hxui_metadata.symbol.clone(),
        ..Default::default()
    };
    let hxui_packed_metadata = hxui_metadata_state.get_packed_len();
    
    if let Ok(metadata_len) = hxui_packed_metadata {
    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{
        from:ctx.accounts.admin.to_account_info(),
        to:ctx.accounts.hxui_mint.to_account_info()
    });
    let amount = rent.minimum_balance(metadata_len);
    transfer(cpi_context,amount)?;
        
        let seeds:&[&[u8]] = &[b"hxui_mint",&[ctx.bumps.hxui_mint]];
        let signer_seeds = [&seeds[..]];
        let hxui_metadata_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),TokenMetadataInitialize{
            program_id:ctx.accounts.token_program.to_account_info(),
            mint: ctx.accounts.hxui_mint.to_account_info(),
            metadata: ctx.accounts.hxui_mint.to_account_info(),
            update_authority: ctx.accounts.hxui_mint.to_account_info(),
            mint_authority: ctx.accounts.hxui_mint.to_account_info(),
        }).with_signer(&signer_seeds);
        token_metadata_initialize(hxui_metadata_context, hxui_metadata.name, hxui_metadata.symbol, hxui_metadata.uri)?;
    }

    // hxui lite mint 
    let mint_len = ExtensionType::try_calculate_account_len::<PodMint>(&[ExtensionType::NonTransferable,ExtensionType::MetadataPointer])?;
    
    let hxui_lite_metadata_state = TokenMetadata{
        name:"100xUI Lite".to_string(),
        symbol:"HXUILITE".to_string(),uri:"https://100xui.com/metadata/hxui-lite/metadata.json".to_string(),
        ..Default::default()
    };

    let hxui_lite_packed_metadata = hxui_lite_metadata_state.get_packed_len();
    if let Ok(metadata_len) = hxui_lite_packed_metadata {
        let rent = rent.minimum_balance(mint_len) + rent.minimum_balance(metadata_len);

        let seeds:&[&[u8]] = &[b"hxui_lite_mint",&[ctx.bumps.hxui_lite_mint]];
        let signer_seeds = [&seeds[..]];
        let create_account_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(),CreateAccount{
            from:ctx.accounts.admin.to_account_info(),
            to:ctx.accounts.hxui_lite_mint.to_account_info()
        }).with_signer(&signer_seeds);
        create_account(create_account_ctx, rent, mint_len as u64, ctx.accounts.token_program.key)?;

        let non_transferable_mint_initialize_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(),NonTransferableMintInitialize{
            token_program_id:ctx.accounts.token_program.to_account_info(),
            mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        });

        non_transferable_mint_initialize(non_transferable_mint_initialize_ctx)?;

        let metadata_pointer_initialize_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(),MetadataPointerInitialize{
            token_program_id:ctx.accounts.token_program.to_account_info(),
            mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        });

        metadata_pointer_initialize(metadata_pointer_initialize_ctx,Some(ctx.accounts.lite_authority.key()),Some(ctx.accounts.hxui_lite_mint.key()))?;

        let initialise_mint = CpiContext::new(ctx.accounts.token_program.to_account_info(),InitializeMint2{
            mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        });

        initialize_mint2(initialise_mint,0,&ctx.accounts.lite_authority.key(),None)?;

        let token_metadata_initialize_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(),TokenMetadataInitialize{
            program_id:ctx.accounts.token_program.to_account_info(),
            mint: ctx.accounts.hxui_lite_mint.to_account_info(),
            metadata: ctx.accounts.hxui_lite_mint.to_account_info(),
            update_authority: ctx.accounts.lite_authority.to_account_info(),
            mint_authority: ctx.accounts.lite_authority.to_account_info(),
        }); 
        token_metadata_initialize(token_metadata_initialize_ctx,hxui_lite_metadata_state.name,hxui_lite_metadata_state.symbol,hxui_lite_metadata_state.uri)?;

    }

    Ok(())

}