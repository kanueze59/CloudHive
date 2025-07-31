;; marketplace.clar
;; CloudHive Decentralized Compute & Storage Marketplace

;; Admin
(define-data-var admin principal tx-sender)

;; Registered providers and their resource details
(define-map providers principal
  {
    compute-units: uint,
    storage-gb: uint,
    price-per-unit: uint,
    available: bool
  }
)

;; Job struct and status
(define-map jobs uint
  {
    client: principal,
    provider: principal,
    compute-units: uint,
    storage-gb: uint,
    payment: uint,
    status: (string-ascii 32)
  }
)

;; Counter for job IDs
(define-data-var job-counter uint u0)

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PROVIDER-NOT-FOUND u101)
(define-constant ERR-JOB-NOT-FOUND u102)
(define-constant ERR-JOB-NOT-PENDING u103)
(define-constant ERR-INSUFFICIENT-RESOURCES u104)

;; Admin check
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Register a provider
(define-public (register-provider (compute-units uint) (storage-gb uint) (price-per-unit uint))
  (begin
    (map-set providers tx-sender {
      compute-units: compute-units,
      storage-gb: storage-gb,
      price-per-unit: price-per-unit,
      available: true
    })
    (ok true)
  )
)

;; Remove a provider
(define-public (deregister-provider)
  (begin
    (map-delete providers tx-sender)
    (ok true)
  )
)

;; Update provider availability
(define-public (set-provider-availability (is-available bool))
  (begin
    (match (map-get? providers tx-sender)
      provider
        (map-set providers tx-sender {
          compute-units: (get compute-units provider),
          storage-gb: (get storage-gb provider),
          price-per-unit: (get price-per-unit provider),
          available: is-available
        })
        (ok true)
      (err ERR-PROVIDER-NOT-FOUND)
    )
  )
)

;; Create a new job request
(define-public (create-job (provider principal) (compute-units uint) (storage-gb uint))
  (begin
    (match (map-get? providers provider)
      prov
        (if (or (not (get available prov))
                (< (get compute-units prov) compute-units)
                (< (get storage-gb prov) storage-gb))
            (err ERR-INSUFFICIENT-RESOURCES)
            (let
              ((job-id (+ u1 (var-get job-counter)))
               (total-payment (* (+ compute-units storage-gb) (get price-per-unit prov))))
              (map-set jobs job-id {
                client: tx-sender,
                provider: provider,
                compute-units: compute-units,
                storage-gb: storage-gb,
                payment: total-payment,
                status: "pending"
              })
              (var-set job-counter job-id)
              (ok job-id)
            )
        )
      (err ERR-PROVIDER-NOT-FOUND)
    )
  )
)

;; Provider accepts a job
(define-public (accept-job (job-id uint))
  (begin
    (match (map-get? jobs job-id)
      job
        (if (not (is-eq tx-sender (get provider job)))
            (err ERR-NOT-AUTHORIZED)
            (if (is-eq (get status job) "pending")
                (begin
                  (map-set jobs job-id (merge job { status: "accepted" }))
                  (ok true)
                )
                (err ERR-JOB-NOT-PENDING)
            )
        )
      (err ERR-JOB-NOT-FOUND)
    )
  )
)

;; Client marks job as complete
(define-public (complete-job (job-id uint))
  (begin
    (match (map-get? jobs job-id)
      job
        (if (not (is-eq tx-sender (get client job)))
            (err ERR-NOT-AUTHORIZED)
            (if (is-eq (get status job) "accepted")
                (begin
                  (map-set jobs job-id (merge job { status: "completed" }))
                  ;; Payment logic would go here (via escrow or token transfer)
                  (ok true)
                )
                (err ERR-JOB-NOT-PENDING)
            )
        )
      (err ERR-JOB-NOT-FOUND)
    )
  )
)

;; Admin transfer
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Read-only: check job details
(define-read-only (get-job (job-id uint))
  (match (map-get? jobs job-id)
    job (ok job)
    (err ERR-JOB-NOT-FOUND)
  )
)

;; Read-only: check provider info
(define-read-only (get-provider (provider principal))
  (match (map-get? providers provider)
    p (ok p)
    (err ERR-PROVIDER-NOT-FOUND)
  )
)
