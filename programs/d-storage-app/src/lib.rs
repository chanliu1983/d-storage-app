use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use std::collections::HashMap;

declare_id!("Ed5i4GsQCTU5NLvgieHUWHFAGfBJ61NfktWw271fesEJ");

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = signer, space = 8 + 32 + 4 + 1000)] // 8 for discriminator, 32 for owner, 4 for vec len, 1000 for data
    pub store: Account<'info, KeyValueStore>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Save<'info> {
    #[account(mut)]
    pub store: Account<'info, KeyValueStore>,
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Query<'info> {
    pub store: Account<'info, KeyValueStore>,
}

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    #[account(mut)]
    pub store: Account<'info, KeyValueStore>,
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[account]
pub struct KeyValueStore {
    pub owner: Pubkey,
    pub data: Vec<u8>, // Serialized HashMap<String, String>
}

#[error_code]
pub enum ErrorCode {
    #[msg("You are not authorized to perform this action")]
    Unauthorized,
}

#[derive(Accounts)]
pub struct TokenTransfer<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    /// CHECK: This is the destination account that will receive the tokens
    #[account(mut)]
    pub to: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    #[account(
        mut,
        constraint = from_ata.owner == from.key(),
        constraint = from_ata.mint == mint.key()
    )]
    pub from_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = to_ata.owner == to.key(),
        constraint = to_ata.mint == mint.key()
    )]
    pub to_ata: Account<'info, TokenAccount>,
    /// CHECK: This is the token mint
    pub mint: AccountInfo<'info>,
}

#[program]
pub mod d_storage_app {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.owner = ctx.accounts.signer.key();
        msg!("Store initialized by: {}", store.owner);
        Ok(())
    }

    pub fn save(ctx: Context<Save>, key: String, value: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        require!(store.owner == ctx.accounts.signer.key(), ErrorCode::Unauthorized);
        
        // Convert the stored data to a HashMap
        let mut data: HashMap<String, String> = if store.data.is_empty() {
            HashMap::new()
        } else {
            borsh::BorshDeserialize::try_from_slice(&store.data)?
        };

        // Insert or update the key-value pair
        data.insert(key.clone(), value.clone());
        
        // Serialize back to bytes
        store.data = borsh::BorshSerialize::try_to_vec(&data)?;
        
        msg!("Saved key-value pair: {} = {}", key, value);
        Ok(())
    }

    pub fn query(ctx: Context<Query>, key: String) -> Result<()> {
        let store = &ctx.accounts.store;
        
        // Deserialize the stored data
        let data: HashMap<String, String> = if store.data.is_empty() {
            HashMap::new()
        } else {
            borsh::BorshDeserialize::try_from_slice(&store.data)?
        };

        // Get the value for the key
        if let Some(value) = data.get(&key) {
            msg!("Query result: {} = {}", key, value);
        } else {
            msg!("Key not found: {}", key);
        }
        
        Ok(())
    }

    pub fn list_all(ctx: Context<Query>) -> Result<()> {
        let store = &ctx.accounts.store;
        
        // Deserialize the stored data
        let data: HashMap<String, String> = if store.data.is_empty() {
            HashMap::new()
        } else {
            borsh::BorshDeserialize::try_from_slice(&store.data)?
        };

        // Log all key-value pairs
        msg!("All key-value pairs:");
        for (key, value) in data.iter() {
            msg!("{} = {}", key, value);
        }
        
        Ok(())
    }

    pub fn transfer_ownership(ctx: Context<TransferOwnership>, new_owner: Pubkey) -> Result<()> {
        let store = &mut ctx.accounts.store;
        require!(store.owner == ctx.accounts.signer.key(), ErrorCode::Unauthorized);
        
        store.owner = new_owner;
        msg!("Store ownership transferred to: {}", new_owner);
        Ok(())
    }

    pub fn transfer_token(
        ctx: Context<TokenTransfer>,
        amount: u64
    ) -> Result<()> {
        let transfer_instruction = Transfer {
            from: ctx.accounts.from_ata.to_account_info(),
            to: ctx.accounts.to_ata.to_account_info(),
            authority: ctx.accounts.from.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_instruction,
            ),
            amount,
        )?;

        msg!("Transferred {} IALT tokens", amount);
        Ok(())
    }
}
