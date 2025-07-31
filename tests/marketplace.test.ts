import { describe, it, expect, beforeEach } from 'vitest'

type Job = {
  id: number
  client: string
  provider?: string
  status: 'created' | 'accepted' | 'completed'
  metadata: string
}

type Provider = {
  address: string
  available: boolean
}

type Result<T> = { value?: T; error?: number }

class MockMarketplace {
  private jobs: Job[] = []
  private providers: Map<string, Provider> = new Map()
  private admin: string = 'deployer'
  private jobCounter = 0

  registerProvider(sender: string): Result<boolean> {
    if (this.providers.has(sender)) return { error: 100 } // already registered
    this.providers.set(sender, { address: sender, available: true })
    return { value: true }
  }

  toggleAvailability(sender: string): Result<boolean> {
    const provider = this.providers.get(sender)
    if (!provider) return { error: 101 }
    provider.available = !provider.available
    return { value: true }
  }

  createJob(sender: string, metadata: string): Result<number> {
    const job: Job = {
      id: this.jobCounter,
      client: sender,
      status: 'created',
      metadata,
    }
    this.jobs.push(job)
    return { value: this.jobCounter++ }
  }

  acceptJob(sender: string, jobId: number): Result<boolean> {
    const provider = this.providers.get(sender)
    const job = this.jobs[jobId]
    if (!provider || !provider.available) return { error: 102 }
    if (!job || job.status !== 'created') return { error: 103 }
    job.status = 'accepted'
    job.provider = sender
    return { value: true }
  }

  completeJob(sender: string, jobId: number): Result<boolean> {
    const job = this.jobs[jobId]
    if (!job || job.status !== 'accepted') return { error: 104 }
    if (job.client !== sender) return { error: 105 }
    job.status = 'completed'
    return { value: true }
  }

  getJob(jobId: number): Job | undefined {
    return this.jobs[jobId]
  }

  getProvider(address: string): Provider | undefined {
    return this.providers.get(address)
  }

  getAdmin(): string {
    return this.admin
  }

  setAdmin(sender: string, newAdmin: string): Result<boolean> {
    if (sender !== this.admin) return { error: 106 }
    this.admin = newAdmin
    return { value: true }
  }
}

describe('Marketplace Smart Contract', () => {
  let marketplace: MockMarketplace

  beforeEach(() => {
    marketplace = new MockMarketplace()
  })

  it('should register a new provider', () => {
    const result = marketplace.registerProvider('provider1')
    expect(result).toEqual({ value: true })
    expect(marketplace.getProvider('provider1')).toBeDefined()
  })

  it('should toggle provider availability', () => {
    marketplace.registerProvider('provider2')
    const result = marketplace.toggleAvailability('provider2')
    expect(result).toEqual({ value: true })
    expect(marketplace.getProvider('provider2')?.available).toBe(false)
  })

  it('should create a job and allow provider to accept and complete it', () => {
    const client = 'client1'
    const provider = 'provider3'

    const reg = marketplace.registerProvider(provider)
    expect(reg).toEqual({ value: true })

    const job = marketplace.createJob(client, 'render my video')
    expect(job.value).toBeTypeOf('number')

    if (job.value !== undefined) {
      const accept = marketplace.acceptJob(provider, job.value)
      expect(accept).toEqual({ value: true })
      expect(marketplace.getJob(job.value)?.status).toBe('accepted')

      const complete = marketplace.completeJob(client, job.value)
      expect(complete).toEqual({ value: true })
      expect(marketplace.getJob(job.value)?.status).toBe('completed')
    } else {
      throw new Error('Job creation failed')
    }
  })

  it('should prevent unregistered providers from accepting jobs', () => {
    const job = marketplace.createJob('client2', 'ai training')
    if (job.value !== undefined) {
      const result = marketplace.acceptJob('fakeProvider', job.value)
      expect(result.error).toBe(102)
    }
  })

  it('should allow admin to change and restrict access to admin-only functions', () => {
    const change = marketplace.setAdmin('deployer', 'newAdmin')
    expect(change).toEqual({ value: true })
    expect(marketplace.getAdmin()).toBe('newAdmin')

    const failed = marketplace.setAdmin('hacker', 'evilAdmin')
    expect(failed.error).toBe(106)
  })

  it('should reject completion from non-client', () => {
    const client = 'client3'
    const provider = 'provider4'

    marketplace.registerProvider(provider)
    const job = marketplace.createJob(client, 'deploy k8s')
    if (job.value !== undefined) {
      marketplace.acceptJob(provider, job.value)
      const result = marketplace.completeJob('notClient', job.value)
      expect(result.error).toBe(105)
    }
  })
})
