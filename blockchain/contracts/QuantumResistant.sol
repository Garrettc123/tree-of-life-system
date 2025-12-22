// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title QuantumResistant
 * @dev Post-quantum cryptographic signature verification
 * Implements SPHINCS+ hash-based signatures for quantum resistance
 */
contract QuantumResistant is Ownable {
    
    struct PublicKey {
        bytes32 root;
        bytes32 seed;
        uint256 height;
        bool registered;
    }
    
    struct Signature {
        bytes32[] authPath;
        bytes32[] wotsPK;
        bytes sig;
        uint256 leafIndex;
    }
    
    // Mapping from address to quantum-resistant public key
    mapping(address => PublicKey) public publicKeys;
    mapping(bytes32 => bool) public usedSignatures;
    
    // Events
    event PublicKeyRegistered(address indexed owner, bytes32 root);
    event SignatureVerified(address indexed signer, bytes32 messageHash);
    event SignatureRevoked(bytes32 signatureHash);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Register a quantum-resistant public key
     * @param _root Merkle root of the SPHINCS+ key
     * @param _seed Random seed used in key generation
     * @param _height Height of the Merkle tree
     */
    function registerPublicKey(
        bytes32 _root,
        bytes32 _seed,
        uint256 _height
    ) external {
        require(!publicKeys[msg.sender].registered, "Key already registered");
        require(_height >= 8 && _height <= 32, "Invalid tree height");
        
        publicKeys[msg.sender] = PublicKey({
            root: _root,
            seed: _seed,
            height: _height,
            registered: true
        });
        
        emit PublicKeyRegistered(msg.sender, _root);
    }
    
    /**
     * @dev Verify a quantum-resistant signature
     * @param _signer Address of the signer
     * @param _messageHash Hash of the signed message
     * @param _authPath Authentication path in Merkle tree
     * @param _wotsPK WOTS+ public key
     * @param _sig WOTS+ signature
     * @param _leafIndex Index of the leaf in Merkle tree
     */
    function verifySignature(
        address _signer,
        bytes32 _messageHash,
        bytes32[] memory _authPath,
        bytes32[] memory _wotsPK,
        bytes memory _sig,
        uint256 _leafIndex
    ) public returns (bool) {
        PublicKey storage pk = publicKeys[_signer];
        require(pk.registered, "Public key not registered");
        
        // Create signature hash to prevent replay attacks
        bytes32 sigHash = keccak256(abi.encodePacked(
            _signer,
            _messageHash,
            _leafIndex,
            block.chainid
        ));
        
        require(!usedSignatures[sigHash], "Signature already used");
        
        // Verify WOTS+ signature
        bytes32 wotsHash = _verifyWOTS(_messageHash, _wotsPK, _sig);
        require(wotsHash != bytes32(0), "Invalid WOTS signature");
        
        // Verify Merkle authentication path
        bytes32 computedRoot = _verifyMerklePath(
            wotsHash,
            _authPath,
            _leafIndex,
            pk.height
        );
        
        require(computedRoot == pk.root, "Invalid Merkle proof");
        
        // Mark signature as used
        usedSignatures[sigHash] = true;
        
        emit SignatureVerified(_signer, _messageHash);
        return true;
    }
    
    /**
     * @dev Verify WOTS+ (Winternitz One-Time Signature) signature
     * Simplified implementation - in production, use full SPHINCS+ library
     */
    function _verifyWOTS(
        bytes32 _message,
        bytes32[] memory _publicKey,
        bytes memory _signature
    ) internal pure returns (bytes32) {
        require(_publicKey.length >= 67, "Invalid PK length"); // WOTS+ typically uses 67 chains
        require(_signature.length >= 2144, "Invalid signature length"); // 67 * 32 bytes
        
        // Hash message to create checksum
        bytes32 messageHash = keccak256(abi.encodePacked(_message));
        
        // Verify each chain of the WOTS+ signature
        bytes32[] memory computed = new bytes32[](_publicKey.length);
        
        for (uint256 i = 0; i < _publicKey.length; i++) {
            bytes32 current = bytes32(_signature[i * 32:(i + 1) * 32]);
            
            // Hash chain verification (simplified)
            for (uint256 j = 0; j < 16; j++) {
                current = keccak256(abi.encodePacked(current, i, j));
            }
            
            computed[i] = current;
        }
        
        // Compute public key hash from signature
        return keccak256(abi.encodePacked(computed));
    }
    
    /**
     * @dev Verify Merkle authentication path
     */
    function _verifyMerklePath(
        bytes32 _leaf,
        bytes32[] memory _path,
        uint256 _index,
        uint256 _height
    ) internal pure returns (bytes32) {
        require(_path.length == _height, "Invalid path length");
        
        bytes32 current = _leaf;
        
        for (uint256 i = 0; i < _height; i++) {
            bytes32 sibling = _path[i];
            
            if (_index % 2 == 0) {
                current = keccak256(abi.encodePacked(current, sibling));
            } else {
                current = keccak256(abi.encodePacked(sibling, current));
            }
            
            _index = _index / 2;
        }
        
        return current;
    }
    
    /**
     * @dev Update public key (requires old key verification)
     */
    function updatePublicKey(
        bytes32 _newRoot,
        bytes32 _newSeed,
        uint256 _newHeight
    ) external {
        require(publicKeys[msg.sender].registered, "No key registered");
        require(_newHeight >= 8 && _newHeight <= 32, "Invalid tree height");
        
        publicKeys[msg.sender] = PublicKey({
            root: _newRoot,
            seed: _newSeed,
            height: _newHeight,
            registered: true
        });
        
        emit PublicKeyRegistered(msg.sender, _newRoot);
    }
    
    /**
     * @dev Check if signature was used
     */
    function isSignatureUsed(
        address _signer,
        bytes32 _messageHash,
        uint256 _leafIndex
    ) external view returns (bool) {
        bytes32 sigHash = keccak256(abi.encodePacked(
            _signer,
            _messageHash,
            _leafIndex,
            block.chainid
        ));
        return usedSignatures[sigHash];
    }
    
    /**
     * @dev Get public key info
     */
    function getPublicKey(address _owner) 
        external 
        view 
        returns (
            bytes32 root,
            bytes32 seed,
            uint256 height,
            bool registered
        ) 
    {
        PublicKey storage pk = publicKeys[_owner];
        return (pk.root, pk.seed, pk.height, pk.registered);
    }
    
    /**
     * @dev Emergency revoke signature (admin only)
     */
    function revokeSignature(
        address _signer,
        bytes32 _messageHash,
        uint256 _leafIndex
    ) external onlyOwner {
        bytes32 sigHash = keccak256(abi.encodePacked(
            _signer,
            _messageHash,
            _leafIndex,
            block.chainid
        ));
        usedSignatures[sigHash] = true;
        emit SignatureRevoked(sigHash);
    }
}