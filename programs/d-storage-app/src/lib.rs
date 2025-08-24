use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("AGrFZZYRCctZB1mpq3bCdMP34DMmb6afdrw2eSCoZ2gz");

#[program]
pub mod flexible_token_exchange {
    use super::*;



    /// Initialize a new liquidity pool for any token-SOL exchange
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        initial_token_amount: u64,
        initial_sol_amount: u64,
        fee_rate: u16,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.token_mint = ctx.accounts.token_mint.key();
        pool.token_vault = ctx.accounts.token_vault.key();
        pool.sol_vault = ctx.accounts.sol_vault.key();
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.token_reserve = initial_token_amount;
        pool.sol_reserve = initial_sol_amount;
        pool.lp_supply = 0;
        pool.fee_rate = fee_rate;
        pool.pool_authority = ctx.accounts.pool_authority.key();
        pool.is_initialized = true;
        pool.created_at = Clock::get()?.unix_timestamp;
        
        // Transfer initial liquidity
        if initial_token_amount > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.authority_token_account.to_account_info(),
                        to: ctx.accounts.token_vault.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    },
                ),
                initial_token_amount,
            )?;
        }

        // Transfer initial SOL from authority to vault
        if initial_sol_amount > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.authority.to_account_info(),
                        to: ctx.accounts.sol_vault.to_account_info(),
                    },
                ),
                initial_sol_amount,
            )?;
        }

        // Mint initial LP tokens (geometric mean of reserves)
        let initial_lp_tokens = (initial_token_amount as f64 * initial_sol_amount as f64).sqrt() as u64;
        pool.lp_supply = initial_lp_tokens;

        Ok(())
    }

    /// Add liquidity to the pool
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        token_amount: u64,
        sol_amount: u64,
        min_lp_tokens: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        
        // Calculate optimal amounts based on current ratio
        let token_reserve = pool.token_reserve;
        let sol_reserve = pool.sol_reserve;
        
        let optimal_sol_amount = if token_reserve == 0 {
            sol_amount
        } else {
            (token_amount * sol_reserve) / token_reserve
        };
        
        let optimal_token_amount = if sol_reserve == 0 {
            token_amount
        } else {
            (sol_amount * token_reserve) / sol_reserve
        };
        
        let final_token_amount = std::cmp::min(token_amount, optimal_token_amount);
        let final_sol_amount = std::cmp::min(sol_amount, optimal_sol_amount);
        
        // Calculate LP tokens to mint
        let lp_tokens = if pool.lp_supply == 0 {
            (final_token_amount as f64 * final_sol_amount as f64).sqrt() as u64
        } else {
            std::cmp::min(
                (final_token_amount * pool.lp_supply) / token_reserve,
                (final_sol_amount * pool.lp_supply) / sol_reserve,
            )
        };
        
        require!(lp_tokens >= min_lp_tokens, ExchangeError::SlippageExceeded);
        
        // Transfer tokens to vault
        if final_token_amount > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_token_account.to_account_info(),
                        to: ctx.accounts.token_vault.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                final_token_amount,
            )?;
        }
        
        if final_sol_amount > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.user.to_account_info(),
                        to: ctx.accounts.sol_vault.to_account_info(),
                    },
                ),
                final_sol_amount,
            )?;
        }
        
        // Update pool reserves
        pool.token_reserve += final_token_amount;
        pool.sol_reserve += final_sol_amount;
        pool.lp_supply += lp_tokens;
        
        Ok(())
    }

    /// Swap tokens for SOL
    pub fn swap_token_to_sol(
        ctx: Context<SwapTokenToSol>,
        token_amount: u64,
        min_sol_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        
        // Calculate SOL output using constant product formula (x * y = k)
        let token_reserve = pool.token_reserve;
        let sol_reserve = pool.sol_reserve;
        
        // Apply fee (0.3%)
        let token_amount_after_fee = token_amount * (10000 - pool.fee_rate as u64) / 10000;
        
        // Calculate output: sol_out = (sol_reserve * token_in) / (token_reserve + token_in)
        let sol_amount_out = (sol_reserve * token_amount_after_fee) / (token_reserve + token_amount_after_fee);
        
        require!(sol_amount_out >= min_sol_amount, ExchangeError::SlippageExceeded);
        require!(sol_amount_out < sol_reserve, ExchangeError::InsufficientLiquidity);
        
        // Transfer tokens from user to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            token_amount,
        )?;
        
        // Transfer SOL from vault to user
        let sol_vault_bump = ctx.bumps.sol_vault;
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                },
                &[&[b"sol_vault", &[sol_vault_bump]]],
            ),
            sol_amount_out,
        )?;
        
        // Update reserves
        pool.token_reserve += token_amount;
        pool.sol_reserve -= sol_amount_out;
        
        emit!(SwapEvent {
            user: ctx.accounts.user.key(),
            token_in: pool.token_mint,
            token_out: Pubkey::default(), // SOL
            amount_in: token_amount,
            amount_out: sol_amount_out,
        });
        
        Ok(())
    }

    /// Swap SOL for tokens
    pub fn swap_sol_to_token(
        ctx: Context<SwapSolToToken>,
        sol_amount: u64,
        min_token_amount: u64,
    ) -> Result<()> {
        // Get values before any borrows
        let pool_bump = ctx.bumps.pool;
        let token_mint = ctx.accounts.pool.token_mint;
        let token_reserve = ctx.accounts.pool.token_reserve;
        let sol_reserve = ctx.accounts.pool.sol_reserve;
        let fee_rate = ctx.accounts.pool.fee_rate;
        
        // Apply fee
        let sol_amount_after_fee = sol_amount * (10000 - fee_rate as u64) / 10000;
        
        // Calculate output: token_out = (token_reserve * sol_in) / (sol_reserve + sol_in)
        let token_amount_out = (token_reserve * sol_amount_after_fee) / (sol_reserve + sol_amount_after_fee);
        
        require!(token_amount_out >= min_token_amount, ExchangeError::SlippageExceeded);
        require!(token_amount_out < token_reserve, ExchangeError::InsufficientLiquidity);
        
        // Transfer tokens from vault to user
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[&[b"pool", &[pool_bump]]],
            ),
            token_amount_out,
        )?;
        
        // Transfer SOL from user to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            sol_amount,
        )?;
        
        // Update reserves
        let pool = &mut ctx.accounts.pool;
        pool.sol_reserve += sol_amount;
        pool.token_reserve -= token_amount_out;
        
        emit!(SwapEvent {
            user: ctx.accounts.user.key(),
            token_in: Pubkey::default(), // SOL
            token_out: token_mint,
            amount_in: sol_amount,
            amount_out: token_amount_out,
        });
        
        Ok(())
    }

    /// Remove liquidity from the pool
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_tokens: u64,
        min_token_amount: u64,
        min_sol_amount: u64,
    ) -> Result<()> {
        // Get values before any borrows
        let pool_bump = ctx.bumps.pool;
        let token_reserve = ctx.accounts.pool.token_reserve;
        let sol_reserve = ctx.accounts.pool.sol_reserve;
        let lp_supply = ctx.accounts.pool.lp_supply;
        
        // Calculate amounts to withdraw
        let token_amount = (token_reserve * lp_tokens) / lp_supply;
        let sol_amount = (sol_reserve * lp_tokens) / lp_supply;
        
        require!(token_amount >= min_token_amount, ExchangeError::SlippageExceeded);
        require!(sol_amount >= min_sol_amount, ExchangeError::SlippageExceeded);
        
        // Transfer tokens from vault to user
        if token_amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.token_vault.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[&[b"pool", &[pool_bump]]],
                ),
                token_amount,
            )?;
        }
        
        // Transfer SOL from vault to user
        if sol_amount > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.sol_vault.to_account_info(),
                        to: ctx.accounts.user.to_account_info(),
                    },
                    &[&[b"sol_vault", &[ctx.bumps.sol_vault]]],
                ),
                sol_amount,
            )?;
        }
        
        // Update pool state
        let pool = &mut ctx.accounts.pool;
        pool.token_reserve -= token_amount;
        pool.sol_reserve -= sol_amount;
        pool.lp_supply -= lp_tokens;
        
        Ok(())
    }

    /// Update pool fee rate (only pool authority can call this)
    pub fn update_pool_fee(
        ctx: Context<UpdatePoolFee>,
        new_fee_rate: u16,
    ) -> Result<()> {
        require!(new_fee_rate <= 1000, ExchangeError::InvalidFeeRate); // Max 10%
        
        let pool = &mut ctx.accounts.pool;
        let old_fee_rate = pool.fee_rate;
        pool.fee_rate = new_fee_rate;
        
        emit!(FeeUpdateEvent {
            pool: pool.key(),
            old_fee_rate,
            new_fee_rate,
            updated_by: ctx.accounts.authority.key(),
        });
        
        Ok(())
    }
}

// Account structures
#[account]
pub struct TokenRegistry {
    pub token_mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub metadata_uri: String,
    pub creator: Pubkey,
    pub total_supply: u64,
    pub is_active: bool,
    pub created_at: i64,
}

#[account]
pub struct LiquidityPool {
    pub token_mint: Pubkey,        // Configurable token mint
    pub token_vault: Pubkey,       // Token vault account
    pub sol_vault: Pubkey,         // SOL vault account
    pub lp_mint: Pubkey,          // LP token mint
    pub token_reserve: u64,        // Current token reserves
    pub sol_reserve: u64,          // Current SOL reserves
    pub lp_supply: u64,           // Total LP tokens issued
    pub fee_rate: u16,            // Fee rate in basis points (e.g., 30 = 0.3%)
    pub pool_authority: Pubkey,    // Pool authority PDA
    pub is_initialized: bool,      // Pool initialization status
    pub created_at: i64,          // Pool creation timestamp
}

// Context structures
#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// CHECK: Token mint account - must be a valid SPL token mint
    #[account(
        constraint = token_mint.mint_authority.is_some() @ ExchangeError::InvalidTokenMint
    )]
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 2 + 32 + 1 + 8,
        seeds = [b"pool", token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", token_mint.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,
    
    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = pool_authority,
        seeds = [b"token_vault", token_mint.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    
    /// CHECK: SOL vault is a PDA that will hold SOL
    #[account(
        init,
        payer = authority,
        space = 0,
        seeds = [b"sol_vault", token_mint.key().as_ref()],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,
    
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = pool_authority,
        seeds = [b"lp_mint", token_mint.key().as_ref()],
        bump
    )]
    pub lp_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = authority
    )]
    pub authority_token_account: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"token_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    /// CHECK: SOL vault
    #[account(
        mut,
        seeds = [b"sol_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapTokenToSol<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"token_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    /// CHECK: SOL vault
    #[account(
        mut,
        seeds = [b"sol_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapSolToToken<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"token_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    /// CHECK: SOL vault
    #[account(
        mut,
        seeds = [b"sol_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"token_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,
    /// CHECK: SOL vault
    #[account(
        mut,
        seeds = [b"sol_vault", pool.token_mint.key().as_ref()],
        bump
    )]
    pub sol_vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}



#[derive(Accounts)]
pub struct UpdatePoolFee<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(
        constraint = authority.key() == pool.pool_authority @ ExchangeError::Unauthorized
    )]
    pub authority: Signer<'info>,
}



// Events
#[event]
pub struct SwapEvent {
    pub user: Pubkey,
    pub token_in: Pubkey,
    pub token_out: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
}

#[event]
pub struct FeeUpdateEvent {
    pub pool: Pubkey,
    pub old_fee_rate: u16,
    pub new_fee_rate: u16,
    pub updated_by: Pubkey,
}

// Error codes
#[error_code]
pub enum ExchangeError {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Insufficient liquidity in the pool")]
    InsufficientLiquidity,
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    #[msg("Pool not initialized")]
    PoolNotInitialized,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid fee rate - must be between 0 and 1000 basis points (10%)")]
    InvalidFeeRate,
}
